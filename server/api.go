package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/labstack/echo/v4"
)

var studentIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type API struct {
	db  *sql.DB
	hub *Hub
}

func (a *API) register(g *echo.Group) {
	g.GET("/decks", a.listDecks)
	g.POST("/decks", a.createDeck)
	g.GET("/decks/:id", a.getDeck)
	g.PUT("/decks/:id", a.saveDeck)
	g.DELETE("/decks/:id", a.deleteDeck)
	g.POST("/decks/:id/slides", a.appendSlides)
	g.POST("/decks/:id/sessions", a.startSession)
	g.GET("/decks/:id/sessions", a.listSessions)
	g.GET("/decks/:id/sessions/:sid/export", a.exportSession)
	g.GET("/sessions/:code", a.sessionInfo)
	g.POST("/sessions/:code/join", a.joinSession)
	g.GET("/ws/:code", a.hub.serveWS)
}

// teacherKey reads the key from X-Teacher-Key, or from a bearer token since
// many AI agent tools only know how to send that.
func teacherKey(c echo.Context) (string, error) {
	h := c.Request().Header
	key := strings.TrimSpace(h.Get("X-Teacher-Key"))
	if key == "" {
		if auth := h.Get("Authorization"); len(auth) > 7 && strings.EqualFold(auth[:7], "bearer ") {
			key = strings.TrimSpace(auth[7:])
		}
	}
	if len(key) < 16 {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Missing teacher key")
	}
	return key, nil
}

func (a *API) ownedDeck(c echo.Context) (string, error) {
	key, err := teacherKey(c)
	if err != nil {
		return "", err
	}
	id := c.Param("id")
	var owner string
	err = a.db.QueryRow(`SELECT owner_key FROM decks WHERE id = ?`, id).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && owner != key) {
		return "", echo.NewHTTPError(http.StatusNotFound, "Deck not found")
	}
	return id, err
}

func (a *API) listDecks(c echo.Context) error {
	key, err := teacherKey(c)
	if err != nil {
		return err
	}
	rows, err := a.db.Query(`
		SELECT d.id, d.title, d.updated_at,
			(SELECT COUNT(*) FROM slides s WHERE s.deck_id = d.id),
			COALESCE((SELECT code FROM sessions x WHERE x.deck_id = d.id AND x.status = 'live' ORDER BY created_at DESC LIMIT 1), '')
		FROM decks d WHERE d.owner_key = ? ORDER BY d.updated_at DESC`, key)
	if err != nil {
		return err
	}
	defer rows.Close()
	decks := []Deck{}
	for rows.Next() {
		var d Deck
		if err := rows.Scan(&d.ID, &d.Title, &d.UpdatedAt, &d.SlideCount, &d.LiveCode); err != nil {
			return err
		}
		decks = append(decks, d)
	}
	return c.JSON(http.StatusOK, decks)
}

func (a *API) createDeck(c echo.Context) error {
	key, err := teacherKey(c)
	if err != nil {
		return err
	}
	var body struct {
		Title  string  `json:"title"`
		Slides []Slide `json:"slides"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	title := truncate(strings.TrimSpace(body.Title), 120)
	if title == "" {
		title = "Untitled session"
	}
	slides := body.Slides
	if len(slides) == 0 {
		slides = []Slide{{Type: SlidePoll, Question: "How are you feeling today?",
			Options: []string{"Great", "Okay", "Sleepy", "Ready to learn"}}}
	} else if err := checkSlides(slides, 0); err != nil {
		return err
	}
	id, now := newID(), nowMs()

	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO decks (id, owner_key, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, key, title, now, now); err != nil {
		return err
	}
	if err := insertSlides(tx, id, 0, slides); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, Deck{ID: id, Title: title, Slides: slides, SlideCount: len(slides), UpdatedAt: now})
}

// checkSlides validates slides coming from API clients. offset is the number
// of slides already in the deck, so error messages point at the right slide.
func checkSlides(slides []Slide, offset int) error {
	if offset+len(slides) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "A deck can hold up to 100 slides")
	}
	for i := range slides {
		if err := slides[i].validate(offset + i); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
	}
	return nil
}

// insertSlides normalizes slides in place and stores them from position start.
func insertSlides(tx *sql.Tx, deckID string, start int, slides []Slide) error {
	for i := range slides {
		s := &slides[i]
		if len(s.ID) < 8 {
			s.ID = newID()
		}
		s.normalize()
		data, _ := json.Marshal(s)
		if _, err := tx.Exec(`INSERT INTO slides (id, deck_id, position, data) VALUES (?, ?, ?, ?)`,
			s.ID, deckID, start+i, string(data)); err != nil {
			return err
		}
	}
	return nil
}

func (a *API) loadSlides(deckID string) ([]Slide, error) {
	rows, err := a.db.Query(`SELECT data FROM slides WHERE deck_id = ? ORDER BY position`, deckID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	slides := []Slide{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var s Slide
		if err := json.Unmarshal([]byte(raw), &s); err != nil {
			return nil, err
		}
		slides = append(slides, s)
	}
	return slides, nil
}

func (a *API) getDeck(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	var d Deck
	if err := a.db.QueryRow(`SELECT id, title, updated_at FROM decks WHERE id = ?`, id).
		Scan(&d.ID, &d.Title, &d.UpdatedAt); err != nil {
		return err
	}
	if d.Slides, err = a.loadSlides(id); err != nil {
		return err
	}
	d.SlideCount = len(d.Slides)
	return c.JSON(http.StatusOK, d)
}

func (a *API) saveDeck(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	var body Deck
	if err := c.Bind(&body); err != nil {
		return err
	}
	title := truncate(strings.TrimSpace(body.Title), 120)
	if title == "" {
		title = "Untitled session"
	}
	// The web editor autosaves half finished slides, so it opts out of strict checks.
	if c.QueryParam("draft") == "1" {
		if len(body.Slides) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "A deck can hold up to 100 slides")
		}
	} else if err := checkSlides(body.Slides, 0); err != nil {
		return err
	}
	if body.Slides == nil {
		body.Slides = []Slide{}
	}
	now := nowMs()
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE decks SET title = ?, updated_at = ? WHERE id = ?`, title, now, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM slides WHERE deck_id = ?`, id); err != nil {
		return err
	}
	if err := insertSlides(tx, id, 0, body.Slides); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, Deck{ID: id, Title: title, Slides: body.Slides, SlideCount: len(body.Slides), UpdatedAt: now})
}

func (a *API) appendSlides(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	var body struct {
		Slides []Slide `json:"slides"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	if len(body.Slides) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "Send at least one slide in the slides array")
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM slides WHERE deck_id = ?`, id).Scan(&count); err != nil {
		return err
	}
	if err := checkSlides(body.Slides, count); err != nil {
		return err
	}
	if err := insertSlides(tx, id, count, body.Slides); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE decks SET updated_at = ? WHERE id = ?`, nowMs(), id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.getDeck(c)
}

func (a *API) deleteDeck(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	if _, err := a.db.Exec(`DELETE FROM decks WHERE id = ?`, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (a *API) startSession(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	var title string
	if err := a.db.QueryRow(`SELECT title FROM decks WHERE id = ?`, id).Scan(&title); err != nil {
		return err
	}
	slides, err := a.loadSlides(id)
	if err != nil {
		return err
	}
	if len(slides) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "Add at least one slide before going live")
	}
	// One live session per deck keeps the teacher dashboard simple.
	var old []string
	rows, err := a.db.Query(`SELECT code FROM sessions WHERE deck_id = ? AND status = 'live'`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var code string
		_ = rows.Scan(&code)
		old = append(old, code)
	}
	rows.Close()
	for _, code := range old {
		a.hub.endSession(code)
	}

	var code string
	for range 20 {
		code = newJoinCode()
		var n int
		_ = a.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE code = ? AND status = 'live'`, code).Scan(&n)
		if n == 0 {
			break
		}
	}
	data, _ := json.Marshal(slides)
	if _, err := a.db.Exec(`INSERT INTO sessions (id, deck_id, code, title, slides, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		newID(), id, code, title, string(data), nowMs()); err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, map[string]string{"code": code})
}

func (a *API) sessionInfo(c echo.Context) error {
	var title string
	err := a.db.QueryRow(`SELECT title FROM sessions WHERE code = ? AND status = 'live'`, c.Param("code")).Scan(&title)
	if errors.Is(err, sql.ErrNoRows) {
		return echo.NewHTTPError(http.StatusNotFound, "No live session with that code")
	}
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, map[string]string{"code": c.Param("code"), "title": title})
}

func (a *API) joinSession(c echo.Context) error {
	var body struct {
		Nickname  string `json:"nickname"`
		StudentID string `json:"studentId"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	nick := truncate(strings.Join(strings.Fields(body.Nickname), " "), 24)
	if nick == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Pick a display name first")
	}
	studentID := strings.Join(strings.Fields(body.StudentID), "")
	if studentID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Enter your NRP")
	}
	if len(studentID) > 20 || !studentIDPattern.MatchString(studentID) {
		return echo.NewHTTPError(http.StatusBadRequest, "NRP can only use letters and numbers, up to 20 characters")
	}
	var sessionID string
	err := a.db.QueryRow(`SELECT id FROM sessions WHERE code = ? AND status = 'live'`, c.Param("code")).Scan(&sessionID)
	if errors.Is(err, sql.ErrNoRows) {
		return echo.NewHTTPError(http.StatusNotFound, "No live session with that code")
	}
	if err != nil {
		return err
	}
	id, token := newID(), newToken()
	_, err = a.db.Exec(`INSERT INTO participants (id, session_id, nickname, student_id, token, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, sessionID, nick, studentID, token, nowMs())
	if err != nil {
		if strings.Contains(err.Error(), "student_id") {
			return echo.NewHTTPError(http.StatusConflict, "That NRP already joined this session, ask your teacher if this is a mistake")
		}
		if strings.Contains(err.Error(), "UNIQUE") {
			return echo.NewHTTPError(http.StatusConflict, "That display name is taken, try another one")
		}
		return err
	}
	a.hub.touch(c.Param("code"))
	return c.JSON(http.StatusCreated, map[string]string{"participantId": id, "token": token, "nickname": nick, "studentId": studentID})
}
