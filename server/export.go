package main

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // The alpine image has no zoneinfo, and exports are shown in the teacher's time zone.

	"github.com/labstack/echo/v4"
)

type SessionSummary struct {
	ID               string `json:"id"`
	Code             string `json:"code"`
	Status           string `json:"status"`
	CreatedAt        int64  `json:"createdAt"`
	ParticipantCount int    `json:"participantCount"`
	ResponseCount    int    `json:"responseCount"`
}

type ExportAnswer struct {
	SlideID string   `json:"slideId"`
	Values  []string `json:"values"`
	Score   int      `json:"score"`
	// Correct is set for quiz slides the student answered.
	Correct *bool `json:"correct,omitempty"`
}

type ExportStudent struct {
	DisplayName string         `json:"displayName"`
	StudentID   string         `json:"studentId"`
	JoinedAt    int64          `json:"joinedAt"`
	Score       int            `json:"score"`
	Answers     []ExportAnswer `json:"answers"`
}

type SessionExport struct {
	Session  SessionSummary  `json:"session"`
	Title    string          `json:"title"`
	Slides   []Slide         `json:"slides"`
	Students []ExportStudent `json:"students"`
}

func (a *API) listSessions(c echo.Context) error {
	id, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	rows, err := a.db.Query(`
		SELECT s.id, s.code, s.status, s.created_at,
			(SELECT COUNT(*) FROM participants p WHERE p.session_id = s.id),
			(SELECT COUNT(*) FROM responses r WHERE r.session_id = s.id)
		FROM sessions s WHERE s.deck_id = ? ORDER BY s.created_at DESC`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	list := []SessionSummary{}
	for rows.Next() {
		var s SessionSummary
		if err := rows.Scan(&s.ID, &s.Code, &s.Status, &s.CreatedAt, &s.ParticipantCount, &s.ResponseCount); err != nil {
			return err
		}
		list = append(list, s)
	}
	return c.JSON(http.StatusOK, list)
}

func (a *API) loadExport(deckID, sessionID string) (*SessionExport, error) {
	ex := &SessionExport{Students: []ExportStudent{}}
	var slidesRaw string
	err := a.db.QueryRow(`
		SELECT s.id, s.code, s.status, s.created_at, s.title, s.slides
		FROM sessions s WHERE s.id = ? AND s.deck_id = ?`, sessionID, deckID).
		Scan(&ex.Session.ID, &ex.Session.Code, &ex.Session.Status, &ex.Session.CreatedAt, &ex.Title, &slidesRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, echo.NewHTTPError(http.StatusNotFound, "Session not found")
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(slidesRaw), &ex.Slides); err != nil {
		return nil, err
	}

	rows, err := a.db.Query(`SELECT id, nickname, student_id, created_at FROM participants
		WHERE session_id = ? ORDER BY student_id, nickname COLLATE NOCASE`, sessionID)
	if err != nil {
		return nil, err
	}
	index := map[string]int{}
	for rows.Next() {
		var pid string
		var st ExportStudent
		if err := rows.Scan(&pid, &st.DisplayName, &st.StudentID, &st.JoinedAt); err != nil {
			rows.Close()
			return nil, err
		}
		st.Answers = []ExportAnswer{}
		index[pid] = len(ex.Students)
		ex.Students = append(ex.Students, st)
	}
	rows.Close()

	slideAt := map[string]*Slide{}
	for i := range ex.Slides {
		slideAt[ex.Slides[i].ID] = &ex.Slides[i]
	}
	// answers[student][slideID] keeps each student's answers grouped per slide.
	answers := make([]map[string]*ExportAnswer, len(ex.Students))
	rows, err = a.db.Query(`SELECT participant_id, slide_id, value, score FROM responses
		WHERE session_id = ? ORDER BY created_at`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid, slideID, value string
		var score int
		if err := rows.Scan(&pid, &slideID, &value, &score); err != nil {
			return nil, err
		}
		i, ok := index[pid]
		slide := slideAt[slideID]
		if !ok || slide == nil {
			continue
		}
		if answers[i] == nil {
			answers[i] = map[string]*ExportAnswer{}
		}
		ans := answers[i][slideID]
		if ans == nil {
			ans = &ExportAnswer{SlideID: slideID, Values: []string{}}
			answers[i][slideID] = ans
		}
		text := value
		if slide.Type == SlidePoll || slide.Type == SlideQuiz {
			if n, err := strconv.Atoi(value); err == nil && n >= 0 && n < len(slide.Options) {
				text = slide.Options[n]
				if slide.Type == SlideQuiz {
					correct := false
					for _, c := range slide.Correct {
						correct = correct || c == n
					}
					ans.Correct = &correct
				}
			}
		}
		ans.Values = append(ans.Values, text)
		ex.Session.ResponseCount++
		ans.Score += score
		ex.Students[i].Score += score
	}
	for i := range ex.Students {
		for _, s := range ex.Slides {
			if ans := answers[i][s.ID]; ans != nil {
				ex.Students[i].Answers = append(ex.Students[i].Answers, *ans)
			}
		}
	}
	ex.Session.ParticipantCount = len(ex.Students)
	return ex, nil
}

var fileUnsafe = regexp.MustCompile(`[^A-Za-z0-9]+`)

// cell stops spreadsheet apps from running student text as a formula.
func cell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func (a *API) exportSession(c echo.Context) error {
	deckID, err := a.ownedDeck(c)
	if err != nil {
		return err
	}
	ex, err := a.loadExport(deckID, c.Param("sid"))
	if err != nil {
		return err
	}
	if c.QueryParam("format") == "json" {
		return c.JSON(http.StatusOK, ex)
	}

	loc, err := time.LoadLocation(c.QueryParam("tz"))
	if err != nil {
		loc = time.UTC
	}
	hasQuiz := false
	header := []string{"Display name", "NRP", "Joined at", "Total score"}
	for i, s := range ex.Slides {
		header = append(header, cell(fmt.Sprintf("Q%d %s", i+1, s.Question)))
		if s.Type == SlideQuiz {
			hasQuiz = true
			header = append(header, fmt.Sprintf("Q%d correct", i+1), fmt.Sprintf("Q%d points", i+1))
		}
	}
	if !hasQuiz {
		header = append(header[:3], header[4:]...)
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // Lets Excel detect UTF-8.
	w := csv.NewWriter(&buf)
	_ = w.Write(header)
	for _, st := range ex.Students {
		row := []string{cell(st.DisplayName), cell(st.StudentID), time.UnixMilli(st.JoinedAt).In(loc).Format("2006-01-02 15:04")}
		if hasQuiz {
			row = append(row, strconv.Itoa(st.Score))
		}
		got := map[string]ExportAnswer{}
		for _, ans := range st.Answers {
			got[ans.SlideID] = ans
		}
		for _, s := range ex.Slides {
			ans, ok := got[s.ID]
			row = append(row, cell(strings.Join(ans.Values, " | ")))
			if s.Type == SlideQuiz {
				switch {
				case !ok || ans.Correct == nil:
					row = append(row, "", "0")
				case *ans.Correct:
					row = append(row, "yes", strconv.Itoa(ans.Score))
				default:
					row = append(row, "no", strconv.Itoa(ans.Score))
				}
			}
		}
		_ = w.Write(row)
	}
	w.Flush()

	name := strings.Trim(fileUnsafe.ReplaceAllString(ex.Title, "-"), "-")
	if name == "" {
		name = "session"
	}
	name += "-" + time.UnixMilli(ex.Session.CreatedAt).In(loc).Format("2006-01-02") + ".csv"
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.Blob(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}
