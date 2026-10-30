# Pulse

Live polls, quizzes, word clouds, scales and Q&A for classrooms. Teachers build a session, hit Present, and students join from any phone with a six digit code. No student accounts.

## Stack

| Layer | Tools |
| --- | --- |
| Frontend | Vite, React, SWC, TypeScript, SCSS, shadcn/ui (Tailwind v4), lucide icons, Inter |
| Backend | Go, Echo, gorilla/websocket, SQLite (pure Go `modernc.org/sqlite`) |
| Shipping | Single static binary with the built frontend embedded, Docker Compose |

## Slide types

* **Poll** with up to eight options, votes can change until you move on
* **Quiz** with timers, speed based points, auto reveal and a leaderboard
* **Word cloud** where repeated words grow bigger
* **Open ended** answers shown as sticky notes, removable by the teacher
* **Scale** ratings with an average
* **Q&A** where students ask and upvote questions

## Run with Docker

```bash
docker compose up --build -d
```

Open http://localhost:8080. Data lives in the `pulse-data` volume. Set `PULSE_PORT` to change the host port.

## Develop

Two terminals.

```bash
make dev-server
```

```bash
make dev-web
```

Vite runs on http://localhost:5173 and proxies `/api` (websockets included) to the Go server on `:8080`.

## Build a binary

```bash
make build && ./bin/pulse -db pulse.db
```

## How it works

* Teachers are identified by a random key kept in their browser, sent as `X-Teacher-Key`. Decks belong to that key.
* Starting a session snapshots the deck, so edits during class do not disturb a live session.
* Every connected client gets a full state snapshot over one websocket per room whenever something changes. Students never receive the answer key before a reveal.

## Layout

```
server/   Go API, websocket hub, SQLite schema, embedded dist/
web/      Vite React app (pages/, components/, lib/, styles/)
```
