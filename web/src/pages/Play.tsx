import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Check, CircleCheckBig, CircleX, Hourglass, Loader2, PartyPopper, Send, Star, WifiOff } from "lucide-react"
import { Leaderboard } from "@/components/Leaderboard"
import { ResultsView } from "@/components/ResultsView"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { savedPlayer } from "@/lib/api"
import { OPTION_COLORS, OPTION_SHAPES, SLIDE_META } from "@/lib/slides"
import type { RoomState } from "@/lib/types"
import { useCountdown, useRoom } from "@/lib/useRoom"
import { cn } from "@/lib/utils"

type SendFn = (msg: Record<string, unknown>) => void

export default function Play() {
  const { code = "" } = useParams()
  const navigate = useNavigate()
  const player = useMemo(() => savedPlayer(code), [code])
  const { state, connected, gone, error, send, clockOffset } = useRoom(
    code,
    player ? { role: "player", token: player.token } : null,
  )
  const countdown = useCountdown(state, clockOffset)

  useEffect(() => {
    if (!player) navigate(`/join/${code}`, { replace: true })
  }, [player, code, navigate])

  if (!player) return null

  if (gone && state?.status !== "ended") {
    return (
      <div className="page center-page bg-tangerine">
        <div className="panel panel--narrow">
          <WifiOff className="panel__icon" strokeWidth={3} />
          <h1 className="panel__title">This session is over</h1>
          <p className="panel__text">Thanks for playing along.</p>
          <Button size="lg" variant="sun" onClick={() => navigate("/")}>
            Back home
          </Button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="page center-page bg-blurple">
        <Loader2 className="spin big-spin" strokeWidth={3} />
      </div>
    )
  }

  const me = state.me
  return (
    <div className="page play">
      <header className="play__bar">
        <span className="chip bg-white">{me?.nickname ?? player.nickname}</span>
        {state.hasQuiz && (
          <span className="chip bg-sun">
            <Star strokeWidth={3} /> {(me?.score ?? 0).toLocaleString()}
          </span>
        )}
        {!connected && <span className="chip bg-tomato">Reconnecting</span>}
      </header>

      <main className="play__main">
        {state.status === "ended" ? (
          <Finished state={state} />
        ) : state.showLeaderboard ? (
          <Leaderboard players={state.leaderboard} highlight={me?.id} />
        ) : !state.slide ? (
          <Lobby nickname={me?.nickname ?? player.nickname} title={state.title} />
        ) : (
          <SlidePanel key={state.slide.id} state={state} send={send} countdown={countdown} />
        )}
      </main>

      {error && <div className="toast">{error}</div>}
    </div>
  )
}

function Lobby({ nickname, title }: { nickname: string; title: string }) {
  return (
    <div className="panel panel--narrow pop-in">
      <PartyPopper className="panel__icon" strokeWidth={3} />
      <h1 className="panel__title">You are in, {nickname}!</h1>
      <p className="panel__text">Waiting for {title} to start. Keep your eyes on the big screen.</p>
      <div className="dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function Finished({ state }: { state: RoomState }) {
  const me = state.me
  return (
    <div className="stack">
      <div className="panel panel--narrow pop-in">
        <PartyPopper className="panel__icon" strokeWidth={3} />
        <h1 className="panel__title">That is a wrap!</h1>
        {state.hasQuiz && me ? (
          <p className="panel__text">
            You finished in place {me.rank} with {me.score.toLocaleString()} points.
          </p>
        ) : (
          <p className="panel__text">Thanks for sharing your thoughts today.</p>
        )}
      </div>
      {state.hasQuiz && <Leaderboard players={state.leaderboard} highlight={me?.id} title="Final standings" />}
    </div>
  )
}

function SlidePanel({ state, send, countdown }: { state: RoomState; send: SendFn; countdown: number | null }) {
  const slide = state.slide!
  const meta = SLIDE_META[slide.type]
  const Icon = meta.icon
  return (
    <div className="stack">
      <div className="play__head">
        <span className={`chip bg-${meta.color}`}>
          <Icon strokeWidth={3} /> {meta.label}
        </span>
        {countdown !== null && (
          <span className={cn("chip", countdown <= 5 ? "bg-tomato" : "bg-white")}>
            <Hourglass strokeWidth={3} /> {countdown}s
          </span>
        )}
      </div>
      <h1 className="play__question">{slide.question || "Untitled question"}</h1>
      <SlideInput state={state} send={send} timeUp={countdown === 0} />
      {state.results && (state.reveal || slide.type === "qa") && (
        <div className={cn("play__results", slide.type !== "qa" && "panel")}>
          <ResultsView
            slide={slide}
            results={state.results}
            reveal={state.reveal}
            compact
            onVote={slide.type === "qa" ? (id) => send({ type: "upvote", responseId: id }) : undefined}
          />
        </div>
      )}
    </div>
  )
}

function SlideInput({ state, send, timeUp }: { state: RoomState; send: SendFn; timeUp: boolean }) {
  const slide = state.slide!
  const mine = state.me?.responses ?? []
  const answer = (value: string | number) => send({ type: "answer", value: String(value) })

  switch (slide.type) {
    case "poll":
    case "quiz": {
      const chosen = mine.length ? Number(mine[0].value) : -1
      if (slide.type === "quiz" && chosen >= 0) {
        if (!state.reveal) {
          return (
            <div className="panel panel--narrow pop-in">
              <CircleCheckBig className="panel__icon" strokeWidth={3} />
              <h2 className="panel__title">Locked in</h2>
              <p className="panel__text">You picked {slide.options[chosen] || `option ${chosen + 1}`}. Fingers crossed.</p>
            </div>
          )
        }
        const right = slide.correct.includes(chosen)
        return (
          <div className={cn("verdict pop-in", right ? "bg-lime" : "bg-tomato")}>
            {right ? <CircleCheckBig strokeWidth={3} /> : <CircleX strokeWidth={3} />}
            <div>
              <h2>{right ? "Correct!" : "Not this time"}</h2>
              <p>{right ? `Plus ${mine[0].score} points` : "Shake it off, the next one is yours"}</p>
            </div>
          </div>
        )
      }
      if (slide.type === "quiz" && (state.reveal || timeUp)) {
        return (
          <div className="verdict bg-white pop-in">
            <Hourglass strokeWidth={3} />
            <div>
              <h2>Time is up</h2>
              <p>Be quick on the next one</p>
            </div>
          </div>
        )
      }
      return (
        <div className={cn("answer-grid", slide.options.length > 4 && "answer-grid--many")}>
          {slide.options.map((opt, i) => {
            const Shape = OPTION_SHAPES[i % OPTION_SHAPES.length]
            return (
              <button
                key={i}
                className={cn("answer-tile", `bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`, chosen === i && "is-chosen")}
                onClick={() => answer(i)}
              >
                <Shape strokeWidth={3} className="answer-tile__shape" />
                <span>{opt || `Option ${i + 1}`}</span>
                {chosen === i && <Check strokeWidth={4} className="answer-tile__check" />}
              </button>
            )
          })}
        </div>
      )
    }
    case "scale": {
      const chosen = mine.length ? Number(mine[0].value) : null
      const values = Array.from({ length: slide.scaleMax - slide.scaleMin + 1 }, (_, i) => slide.scaleMin + i)
      return (
        <div className="scale-pick">
          <div className="scale-pick__row">
            {values.map((v) => (
              <button key={v} className={cn("scale-pick__btn", chosen === v && "is-chosen")} onClick={() => answer(v)}>
                {v}
              </button>
            ))}
          </div>
          <div className="scale-pick__ends">
            <span>{slide.minLabel}</span>
            <span>{slide.maxLabel}</span>
          </div>
          {chosen !== null && <p className="hint">Nice, you can change your answer any time</p>}
        </div>
      )
    }
    case "wordcloud":
    case "open":
    case "qa":
      return <TextAnswer state={state} onSubmit={answer} />
  }
}

function TextAnswer({ state, onSubmit }: { state: RoomState; onSubmit: (v: string) => void }) {
  const slide = state.slide!
  const mine = state.me?.responses ?? []
  const [text, setText] = useState("")
  const left = slide.maxEntries - mine.length
  const long = slide.type === "open"
  const limit = slide.type === "wordcloud" ? 30 : slide.type === "open" ? 280 : 200
  const placeholder =
    slide.type === "wordcloud" ? "One word or a short phrase" : slide.type === "qa" ? "Ask your question" : "Share your thoughts"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || left <= 0) return
    onSubmit(text)
    setText("")
  }

  return (
    <div className="stack stack--tight">
      {left > 0 ? (
        <form className="text-answer" onSubmit={submit}>
          {long ? (
            <Textarea value={text} maxLength={limit} placeholder={placeholder} onChange={(e) => setText(e.target.value)} rows={4} />
          ) : (
            <Input value={text} maxLength={limit} placeholder={placeholder} onChange={(e) => setText(e.target.value)} autoFocus />
          )}
          <div className="text-answer__foot">
            <span className="hint">
              {left} {left === 1 ? "entry" : "entries"} left
            </span>
            <Button type="submit" variant="blurple" disabled={!text.trim()}>
              <Send /> Send
            </Button>
          </div>
        </form>
      ) : (
        <div className="verdict bg-lime pop-in">
          <CircleCheckBig strokeWidth={3} />
          <div>
            <h2>All sent</h2>
            <p>Thanks for sharing</p>
          </div>
        </div>
      )}
      {slide.type !== "qa" && mine.length > 0 && (
        <div className="my-entries">
          {mine.map((m) => (
            <span key={m.id} className="chip bg-white">
              {m.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
