import { useCallback, useEffect, useRef, useState } from "react"
import { api, ApiError } from "./api"
import type { RoomState } from "./types"

export type RoomAuth = { role: "host"; key: string } | { role: "player"; token: string }

export function useRoom(code: string, auth: RoomAuth | null) {
  const [state, setState] = useState<RoomState | null>(null)
  const [connected, setConnected] = useState(false)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const socket = useRef<WebSocket | null>(null)

  const authKey = auth ? (auth.role === "host" ? `h${auth.key}` : `p${auth.token}`) : ""

  useEffect(() => {
    if (!auth) return
    let stopped = false
    let retry = 0
    let timer: number | undefined

    const connect = () => {
      const params = new URLSearchParams(
        auth.role === "host" ? { role: "host", key: auth.key } : { role: "player", token: auth.token },
      )
      const proto = location.protocol === "https:" ? "wss" : "ws"
      const ws = new WebSocket(`${proto}://${location.host}/api/ws/${code}?${params}`)
      socket.current = ws

      ws.onopen = () => {
        retry = 0
        setConnected(true)
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === "state") {
          setState(msg as RoomState)
          setClockOffset(msg.serverNow - Date.now())
        } else if (msg.type === "error") {
          setError(msg.message)
        }
      }
      ws.onclose = async () => {
        setConnected(false)
        if (stopped) return
        try {
          await api.sessionInfo(code)
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setGone(true)
            return
          }
        }
        retry = Math.min(retry + 1, 6)
        timer = window.setTimeout(connect, 400 * retry)
      }
    }
    connect()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      socket.current?.close()
    }
    // authKey captures every field of auth that matters for reconnecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, authKey])

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(null), 3200)
    return () => window.clearTimeout(t)
  }, [error])

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = socket.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  return { state, connected, gone, error, send, clockOffset }
}

/** Seconds left on a timed quiz slide, or null when there is no timer running. */
export function useCountdown(state: RoomState | null, clockOffset: number) {
  const [now, setNow] = useState(() => Date.now())
  const slide = state?.slide
  const active = !!slide && slide.type === "quiz" && slide.timeLimit > 0 && !state?.reveal

  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [active])

  if (!active || !state || !slide) return null
  const elapsed = (now + clockOffset - state.slideStartedAt) / 1000
  return Math.max(0, Math.ceil(slide.timeLimit - elapsed))
}
