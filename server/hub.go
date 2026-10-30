package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Hub struct {
	db    *sql.DB
	mu    sync.Mutex
	rooms map[string]*Room
}

func newHub(db *sql.DB) *Hub {
	return &Hub{db: db, rooms: map[string]*Room{}}
}

type Room struct {
	mu              sync.Mutex
	hub             *Hub
	id              string
	code            string
	ownerKey        string
	title           string
	slides          []Slide
	index           int
	reveal          bool
	showLeaderboard bool
	status          string
	startedAt       int64
	clients         map[*Client]struct{}
}

type Client struct {
	room     *Room
	conn     *websocket.Conn
	send     chan []byte
	host     bool
	pid      string
	nickname string
}

// room returns the in-memory room for a live session, loading it from the database on first use.
func (h *Hub) room(code string) (*Room, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r, ok := h.rooms[code]; ok {
		return r, nil
	}
	r := &Room{hub: h, code: code, clients: map[*Client]struct{}{}}
	var slidesRaw string
	var reveal, lb int
	err := h.db.QueryRow(`
		SELECT s.id, d.owner_key, s.title, s.slides, s.current_index, s.reveal, s.show_leaderboard, s.status, s.slide_started_at
		FROM sessions s JOIN decks d ON d.id = s.deck_id
		WHERE s.code = ? AND s.status = 'live' ORDER BY s.created_at DESC LIMIT 1`, code).
		Scan(&r.id, &r.ownerKey, &r.title, &slidesRaw, &r.index, &reveal, &lb, &r.status, &r.startedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(slidesRaw), &r.slides); err != nil {
		return nil, err
	}
	r.reveal, r.showLeaderboard = reveal == 1, lb == 1
	h.rooms[code] = r
	return r, nil
}

func (h *Hub) touch(code string) {
	if r, err := h.room(code); err == nil {
		r.mu.Lock()
		r.broadcast()
		r.mu.Unlock()
	}
}

func (h *Hub) endSession(code string) {
	r, err := h.room(code)
	if err != nil {
		_, _ = h.db.Exec(`UPDATE sessions SET status = 'ended' WHERE code = ? AND status = 'live'`, code)
		return
	}
	r.mu.Lock()
	r.status = "ended"
	r.persist()
	r.broadcast()
	r.mu.Unlock()
	h.mu.Lock()
	delete(h.rooms, code)
	h.mu.Unlock()
}

func (h *Hub) serveWS(c echo.Context) error {
	r, err := h.room(c.Param("code"))
	if errors.Is(err, sql.ErrNoRows) {
		return echo.NewHTTPError(http.StatusNotFound, "No live session with that code")
	}
	if err != nil {
		return err
	}
	client := &Client{room: r, send: make(chan []byte, 32)}
	if c.QueryParam("role") == "host" {
		if c.QueryParam("key") != r.ownerKey {
			return echo.NewHTTPError(http.StatusForbidden, "Only the session owner can host")
		}
		client.host = true
	} else {
		err := h.db.QueryRow(`SELECT id, nickname FROM participants WHERE session_id = ? AND token = ?`,
			r.id, c.QueryParam("token")).Scan(&client.pid, &client.nickname)
		if err != nil {
			return echo.NewHTTPError(http.StatusForbidden, "Join the session first")
		}
	}
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return nil
	}
	client.conn = conn

	r.mu.Lock()
	r.clients[client] = struct{}{}
	r.broadcast()
	r.mu.Unlock()

	go client.writePump()
	client.readPump()
	return nil
}

const pongWait = 60 * time.Second

func (c *Client) readPump() {
	defer func() {
		r := c.room
		r.mu.Lock()
		if _, ok := r.clients[c]; ok {
			delete(r.clients, c)
			close(c.send)
		}
		r.broadcast()
		r.mu.Unlock()
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg inMessage
		if json.Unmarshal(data, &msg) != nil {
			continue
		}
		c.room.handle(c, msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pongWait * 9 / 10)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type inMessage struct {
	Type       string `json:"type"`
	Index      int    `json:"index"`
	Show       bool   `json:"show"`
	Value      string `json:"value"`
	ResponseID string `json:"responseId"`
}

func (c *Client) sendJSON(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

func (c *Client) fail(message string) {
	c.sendJSON(map[string]string{"type": "error", "message": message})
}

func (r *Room) handle(c *Client, msg inMessage) {
	if msg.Type == "end" && c.host {
		r.hub.endSession(r.code)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != "live" {
		c.fail("This session has ended")
		return
	}
	var err error
	if c.host {
		err = r.handleHost(msg)
	} else {
		err = r.handlePlayer(c, msg)
	}
	if err != nil {
		c.fail(err.Error())
		return
	}
	r.broadcast()
}

func (r *Room) handleHost(msg inMessage) error {
	switch msg.Type {
	case "goto":
		if msg.Index < -1 || msg.Index >= len(r.slides) {
			return errors.New("That slide does not exist")
		}
		r.index = msg.Index
		r.reveal = false
		r.showLeaderboard = false
		r.startedAt = nowMs()
	case "reveal":
		r.reveal = msg.Show
	case "leaderboard":
		r.showLeaderboard = msg.Show
	case "remove":
		if _, err := r.hub.db.Exec(`DELETE FROM responses WHERE id = ? AND session_id = ?`, msg.ResponseID, r.id); err != nil {
			return err
		}
		return nil
	default:
		return errors.New("Unknown action")
	}
	r.persist()
	return nil
}

func (r *Room) current() *Slide {
	if r.index < 0 || r.index >= len(r.slides) {
		return nil
	}
	return &r.slides[r.index]
}

func (r *Room) handlePlayer(c *Client, msg inMessage) error {
	db := r.hub.db
	slide := r.current()
	if slide == nil {
		return errors.New("Hang tight, the teacher has not started yet")
	}
	switch msg.Type {
	case "upvote":
		if slide.Type != SlideQA {
			return errors.New("Voting is only for questions")
		}
		res, err := db.Exec(`DELETE FROM qa_votes WHERE response_id = ? AND participant_id = ?`, msg.ResponseID, c.pid)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			_, err = db.Exec(`INSERT INTO qa_votes (response_id, participant_id)
				SELECT id, ? FROM responses WHERE id = ? AND session_id = ? AND slide_id = ?`,
				c.pid, msg.ResponseID, r.id, slide.ID)
		}
		return err
	case "answer":
	default:
		return errors.New("Unknown action")
	}

	var existing int
	_ = db.QueryRow(`SELECT COUNT(*) FROM responses WHERE session_id = ? AND slide_id = ? AND participant_id = ?`,
		r.id, slide.ID, c.pid).Scan(&existing)
	value := strings.TrimSpace(msg.Value)
	score := 0
	replace := false

	switch slide.Type {
	case SlidePoll, SlideQuiz:
		idx, err := strconv.Atoi(value)
		if err != nil || idx < 0 || idx >= len(slide.Options) {
			return errors.New("Pick one of the options")
		}
		if slide.Type == SlidePoll {
			replace = true
			break
		}
		if r.reveal {
			return errors.New("Answers are locked")
		}
		if existing > 0 {
			return errors.New("You already locked in an answer")
		}
		elapsed := nowMs() - r.startedAt
		if slide.TimeLimit > 0 && elapsed > int64(slide.TimeLimit)*1000+1500 {
			return errors.New("Time is up")
		}
		if slices.Contains(slide.Correct, idx) {
			score = 1000
			if slide.TimeLimit > 0 {
				frac := float64(elapsed) / float64(slide.TimeLimit*1000)
				score = int(1000 - 500*min(frac, 1))
			}
		}
	case SlideScale:
		n, err := strconv.Atoi(value)
		if err != nil || n < slide.ScaleMin || n > slide.ScaleMax {
			return errors.New("Pick a value on the scale")
		}
		replace = true
	case SlideWordCloud, SlideOpen, SlideQA:
		limit := map[string]int{SlideWordCloud: 30, SlideOpen: 280, SlideQA: 200}[slide.Type]
		value = truncate(strings.Join(strings.Fields(value), " "), limit)
		if value == "" {
			return errors.New("Type something first")
		}
		if existing >= slide.MaxEntries {
			return errors.New("You reached the limit for this slide")
		}
	}

	if replace && existing > 0 {
		if _, err := db.Exec(`DELETE FROM responses WHERE session_id = ? AND slide_id = ? AND participant_id = ?`,
			r.id, slide.ID, c.pid); err != nil {
			return err
		}
	}
	_, err := db.Exec(`INSERT INTO responses (id, session_id, slide_id, participant_id, value, score, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, newID(), r.id, slide.ID, c.pid, value, score, nowMs())
	if err != nil {
		return err
	}

	// Reveal a quiz question as soon as every participant has answered.
	if slide.Type == SlideQuiz {
		var answered, total int
		_ = db.QueryRow(`SELECT COUNT(DISTINCT participant_id) FROM responses WHERE session_id = ? AND slide_id = ?`,
			r.id, slide.ID).Scan(&answered)
		_ = db.QueryRow(`SELECT COUNT(*) FROM participants WHERE session_id = ?`, r.id).Scan(&total)
		if answered >= total {
			r.reveal = true
			r.persist()
		}
	}
	return nil
}

func (r *Room) persist() {
	_, err := r.hub.db.Exec(`UPDATE sessions SET current_index = ?, reveal = ?, show_leaderboard = ?, status = ?, slide_started_at = ? WHERE id = ?`,
		r.index, r.reveal, r.showLeaderboard, r.status, r.startedAt, r.id)
	if err != nil {
		log.Printf("persist session %s: %v", r.code, err)
	}
}

// ---- State snapshots ----

type Word struct {
	Text  string `json:"text"`
	Count int    `json:"count"`
}

type Entry struct {
	ID    string `json:"id"`
	Text  string `json:"text"`
	Votes int    `json:"votes"`
	Mine  bool   `json:"mine,omitempty"`
	Voted bool   `json:"voted,omitempty"`
	owner string
}

type Results struct {
	Counts  []int   `json:"counts"`
	Total   int     `json:"total"`
	Average float64 `json:"average"`
	Words   []Word  `json:"words"`
	Entries []Entry `json:"entries"`
}

type Player struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	Score    int    `json:"score"`
	Online   bool   `json:"online"`
}

type MyResponse struct {
	ID    string `json:"id"`
	Value string `json:"value"`
	Score int    `json:"score"`
}

type Me struct {
	ID        string       `json:"id"`
	Nickname  string       `json:"nickname"`
	Score     int          `json:"score"`
	Rank      int          `json:"rank"`
	Responses []MyResponse `json:"responses"`
}

type State struct {
	Type             string   `json:"type"`
	Role             string   `json:"role"`
	Code             string   `json:"code"`
	Title            string   `json:"title"`
	Status           string   `json:"status"`
	Index            int      `json:"index"`
	Total            int      `json:"total"`
	Reveal           bool     `json:"reveal"`
	ShowLeaderboard  bool     `json:"showLeaderboard"`
	HasQuiz          bool     `json:"hasQuiz"`
	SlideStartedAt   int64    `json:"slideStartedAt"`
	ServerNow        int64    `json:"serverNow"`
	Slide            *Slide   `json:"slide"`
	Slides           []Slide  `json:"slides,omitempty"`
	ParticipantCount int      `json:"participantCount"`
	AnsweredCount    int      `json:"answeredCount"`
	Participants     []Player `json:"participants,omitempty"`
	Results          *Results `json:"results"`
	Leaderboard      []Player `json:"leaderboard"`
	Me               *Me      `json:"me,omitempty"`
}

func (r *Room) results(slide *Slide) (*Results, error) {
	res := &Results{Counts: []int{}, Words: []Word{}, Entries: []Entry{}}
	rows, err := r.hub.db.Query(`
		SELECT r.id, r.value, r.participant_id, (SELECT COUNT(*) FROM qa_votes v WHERE v.response_id = r.id)
		FROM responses r WHERE r.session_id = ? AND r.slide_id = ? ORDER BY r.created_at`, r.id, slide.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	people := map[string]bool{}
	words := map[string]*Word{}
	order := []string{}
	sum := 0
	switch slide.Type {
	case SlidePoll, SlideQuiz:
		res.Counts = make([]int, len(slide.Options))
	case SlideScale:
		res.Counts = make([]int, slide.ScaleMax-slide.ScaleMin+1)
	}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.Text, &e.owner, &e.Votes); err != nil {
			return nil, err
		}
		people[e.owner] = true
		switch slide.Type {
		case SlidePoll, SlideQuiz:
			if i, err := strconv.Atoi(e.Text); err == nil && i >= 0 && i < len(res.Counts) {
				res.Counts[i]++
			}
		case SlideScale:
			if n, err := strconv.Atoi(e.Text); err == nil && n >= slide.ScaleMin && n <= slide.ScaleMax {
				res.Counts[n-slide.ScaleMin]++
				sum += n
			}
		case SlideWordCloud:
			key := strings.ToLower(e.Text)
			if w, ok := words[key]; ok {
				w.Count++
			} else {
				words[key] = &Word{Text: e.Text, Count: 1}
				order = append(order, key)
			}
		default:
			res.Entries = append(res.Entries, e)
		}
	}
	res.Total = len(people)
	if slide.Type == SlideScale && res.Total > 0 {
		res.Average = float64(sum) / float64(res.Total)
	}
	for _, k := range order {
		res.Words = append(res.Words, *words[k])
	}
	sort.SliceStable(res.Words, func(i, j int) bool { return res.Words[i].Count > res.Words[j].Count })
	if slide.Type == SlideQA {
		sort.SliceStable(res.Entries, func(i, j int) bool { return res.Entries[i].Votes > res.Entries[j].Votes })
	}
	return res, nil
}

func (r *Room) players() ([]Player, error) {
	online := map[string]bool{}
	for c := range r.clients {
		if !c.host {
			online[c.pid] = true
		}
	}
	rows, err := r.hub.db.Query(`
		SELECT p.id, p.nickname, COALESCE(SUM(r.score), 0) AS total
		FROM participants p LEFT JOIN responses r ON r.participant_id = p.id
		WHERE p.session_id = ? GROUP BY p.id ORDER BY total DESC, p.created_at`, r.id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Player{}
	for rows.Next() {
		var p Player
		if err := rows.Scan(&p.ID, &p.Nickname, &p.Score); err != nil {
			return nil, err
		}
		p.Online = online[p.ID]
		list = append(list, p)
	}
	return list, nil
}

// broadcast sends every connected client a snapshot tailored to its role. Callers hold r.mu.
func (r *Room) broadcast() {
	if len(r.clients) == 0 {
		return
	}
	players, err := r.players()
	if err != nil {
		log.Printf("players %s: %v", r.code, err)
		return
	}
	hasQuiz := slices.ContainsFunc(r.slides, func(s Slide) bool { return s.Type == SlideQuiz })
	slide := r.current()
	var results *Results
	if slide != nil {
		if results, err = r.results(slide); err != nil {
			log.Printf("results %s: %v", r.code, err)
			return
		}
	}
	top := players[:min(len(players), 10)]
	base := State{
		Type: "state", Code: r.code, Title: r.title, Status: r.status,
		Index: r.index, Total: len(r.slides), Reveal: r.reveal, ShowLeaderboard: r.showLeaderboard,
		HasQuiz: hasQuiz, SlideStartedAt: r.startedAt, ServerNow: nowMs(),
		ParticipantCount: len(players), Leaderboard: []Player{},
	}
	if results != nil {
		base.AnsweredCount = results.Total
	}

	for c := range r.clients {
		s := base
		if c.host {
			s.Role = "host"
			s.Slide = slide
			s.Slides = r.slides
			s.Participants = players
			s.Results = results
			s.Leaderboard = top
		} else {
			s.Role = "player"
			if slide != nil {
				pub := slide.public(r.reveal)
				s.Slide = &pub
			}
			if results != nil && (r.reveal || slide.Type == SlideQA) {
				s.Results = r.personalize(results, c.pid, slide)
			}
			if r.showLeaderboard || r.status == "ended" {
				s.Leaderboard = top
			}
			s.Me = r.me(c, players, slide)
		}
		c.sendJSON(s)
	}
}

func (r *Room) personalize(res *Results, pid string, slide *Slide) *Results {
	if slide.Type != SlideQA {
		return res
	}
	voted := map[string]bool{}
	rows, err := r.hub.db.Query(`SELECT v.response_id FROM qa_votes v JOIN responses r ON r.id = v.response_id
		WHERE v.participant_id = ? AND r.slide_id = ? AND r.session_id = ?`, pid, slide.ID, r.id)
	if err == nil {
		for rows.Next() {
			var id string
			_ = rows.Scan(&id)
			voted[id] = true
		}
		rows.Close()
	}
	out := *res
	out.Entries = make([]Entry, len(res.Entries))
	for i, e := range res.Entries {
		e.Mine = e.owner == pid
		e.Voted = voted[e.ID]
		out.Entries[i] = e
	}
	return &out
}

func (r *Room) me(c *Client, players []Player, slide *Slide) *Me {
	m := &Me{ID: c.pid, Nickname: c.nickname, Responses: []MyResponse{}}
	for i, p := range players {
		if p.ID == c.pid {
			m.Score, m.Rank = p.Score, i+1
		}
	}
	if slide == nil {
		return m
	}
	rows, err := r.hub.db.Query(`SELECT id, value, score FROM responses WHERE session_id = ? AND slide_id = ? AND participant_id = ? ORDER BY created_at`,
		r.id, slide.ID, c.pid)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var mr MyResponse
		if rows.Scan(&mr.ID, &mr.Value, &mr.Score) == nil {
			// Hide quiz points until the answer is revealed so nobody can peek.
			if slide.Type == SlideQuiz && !r.reveal {
				m.Score -= mr.Score
				mr.Score = 0
			}
			m.Responses = append(m.Responses, mr)
		}
	}
	return m
}
