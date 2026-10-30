package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS decks (
	id         TEXT PRIMARY KEY,
	owner_key  TEXT NOT NULL,
	title      TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decks_owner ON decks(owner_key);

CREATE TABLE IF NOT EXISTS slides (
	id       TEXT PRIMARY KEY,
	deck_id  TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	data     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slides_deck ON slides(deck_id, position);

CREATE TABLE IF NOT EXISTS sessions (
	id               TEXT PRIMARY KEY,
	deck_id          TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
	code             TEXT NOT NULL,
	title            TEXT NOT NULL,
	slides           TEXT NOT NULL,
	current_index    INTEGER NOT NULL DEFAULT -1,
	reveal           INTEGER NOT NULL DEFAULT 0,
	show_leaderboard INTEGER NOT NULL DEFAULT 0,
	status           TEXT NOT NULL DEFAULT 'live',
	slide_started_at INTEGER NOT NULL DEFAULT 0,
	created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code, status);

CREATE TABLE IF NOT EXISTS participants (
	id         TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	nickname   TEXT NOT NULL,
	token      TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_nick ON participants(session_id, nickname COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS responses (
	id             TEXT PRIMARY KEY,
	session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	slide_id       TEXT NOT NULL,
	participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
	value          TEXT NOT NULL,
	score          INTEGER NOT NULL DEFAULT 0,
	created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_slide ON responses(session_id, slide_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON responses(participant_id);

CREATE TABLE IF NOT EXISTS qa_votes (
	response_id    TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
	participant_id TEXT NOT NULL,
	PRIMARY KEY (response_id, participant_id)
);
`

func openDB(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite allows a single writer, so keep one connection to avoid lock contention.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return db, nil
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func newToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func newJoinCode() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}
