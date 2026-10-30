import type { Deck, Slide } from "./types"

const TEACHER_KEY = "pulse.teacherKey"

function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode, nothing to persist.
  }
}

export function teacherKey() {
  let key = readStorage(TEACHER_KEY)
  if (!key) {
    key = randomHex(24)
    writeStorage(TEACHER_KEY, key)
  }
  return key
}

export interface PlayerSession {
  participantId: string
  token: string
  nickname: string
}

export function savedPlayer(code: string): PlayerSession | null {
  const raw = readStorage(`pulse.player.${code}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PlayerSession
  } catch {
    return null
  }
}

export function savePlayer(code: string, session: PlayerSession) {
  writeStorage(`pulse.player.${code}`, JSON.stringify(session))
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Teacher-Key": teacherKey(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = "Something went wrong, try again"
    try {
      const data = await res.json()
      if (data?.message) message = data.message
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listDecks: () => request<Deck[]>("GET", "/decks"),
  createDeck: (title: string) => request<Deck>("POST", "/decks", { title }),
  getDeck: (id: string) => request<Deck>("GET", `/decks/${id}`),
  saveDeck: (id: string, title: string, slides: Slide[]) =>
    request<Deck>("PUT", `/decks/${id}?draft=1`, { title, slides }),
  deleteDeck: (id: string) => request<void>("DELETE", `/decks/${id}`),
  startSession: (id: string) => request<{ code: string }>("POST", `/decks/${id}/sessions`),
  sessionInfo: (code: string) => request<{ code: string; title: string }>("GET", `/sessions/${code}`),
  join: (code: string, nickname: string) =>
    request<PlayerSession>("POST", `/sessions/${code}/join`, { nickname }),
}

export function formatCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}
