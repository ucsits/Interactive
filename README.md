# UCS Interactive

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

Open http://localhost:8080. Data lives in the `pulse-data` volume. Set `PULSE_PORT` to change the host port. It binds to 127.0.0.1 so a reverse proxy sits in front, set `PULSE_BIND=0.0.0.0` to expose it directly.

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

## Students and results

Students join with a display name, which is the only thing shown on the big screen, and their NRP (student ID). Each NRP can join a session once.

Teachers download results from the chart button on a deck card, or from the final screen after ending a session. The CSV has one row per student with display name, NRP, quiz score and every answer.

## API for AI agents

Teachers can let their own AI build decks. The Sessions page has a "Use your AI" button with a ready prompt and the teacher key.

- `/api/docs` is the Swagger UI.
- `/api/openapi.json` is the OpenAPI 3.1 spec.
- `/llms.txt` is a short plain text guide written for agents.

Agents send the key as `X-Teacher-Key` or `Authorization: Bearer`. `POST /api/decks` takes a title and the full slides array, and bad slides return a 400 that names the slide to fix.
