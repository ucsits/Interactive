import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Download,
  Eye,
  EyeOff,
  Hourglass,
  Loader2,
  Maximize,
  Play,
  Power,
  Smartphone,
  Users,
} from "lucide-react"
import { Leaderboard } from "@/components/Leaderboard"
import { Logo } from "@/components/Logo"
import { ResultsView } from "@/components/ResultsView"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { downloadResults, formatCode, teacherKey } from "@/lib/api"
import { OPTION_COLORS, SLIDE_META } from "@/lib/slides"
import type { RoomState } from "@/lib/types"
import { useCountdown, useRoom } from "@/lib/useRoom"
import { cn } from "@/lib/utils"

export default function Host() {
  const { code = "" } = useParams()
  const navigate = useNavigate()
  const auth = useMemo(() => ({ role: "host" as const, key: teacherKey() }), [])
  const { state, connected, gone, error, send, clockOffset } = useRoom(code, auth)
  const countdown = useCountdown(state, clockOffset)
  const [hideResults, setHideResults] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const autoRevealed = useRef<string | null>(null)

  const go = (index: number) => {
    setHideResults(false)
    send({ type: "goto", index })
  }

  // Reveal quiz answers automatically when the timer runs out.
  useEffect(() => {
    if (countdown === 0 && state?.slide && autoRevealed.current !== state.slide.id) {
      autoRevealed.current = state.slide.id
      send({ type: "reveal", show: true })
    }
  }, [countdown, state?.slide, send])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state || state.status !== "live" || (e.target as HTMLElement).closest("input, textarea")) return
      if (e.key === "ArrowRight" && state.index < state.total - 1) go(state.index + 1)
      if (e.key === "ArrowLeft" && state.index > -1) go(state.index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // go only depends on send, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (gone && state?.status !== "ended") {
    return (
      <div className="page center-page bg-tangerine">
        <div className="panel panel--narrow">
          <h1 className="panel__title">This session is not live</h1>
          <p className="panel__text">It may have ended, or it belongs to another browser.</p>
          <Button variant="sun" size="lg" onClick={() => navigate("/teach")}>
            Back to sessions
          </Button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="page center-page bg-sun">
        <Loader2 className="spin big-spin" strokeWidth={3} />
      </div>
    )
  }

  const slide = state.slide
  const isQuiz = slide?.type === "quiz"
  const resultsVisible = slide && state.results && !hideResults && (!isQuiz || state.reveal)
  const joinHost = location.host

  return (
    <div className="page host">
      <header className="host__bar">
        <Logo to="/teach" />
        <div className="host__join">
          <span className="host__join-text">
            Join at <strong>{joinHost}</strong> with code
          </span>
          <span className="code-chip">{formatCode(state.code)}</span>
        </div>
        <div className="host__bar-right">
          <span className="chip bg-white">
            <Users strokeWidth={3} /> {state.participantCount}
          </span>
          {!connected && <span className="chip bg-tomato">Reconnecting</span>}
          <Button
            variant="outline"
            size="icon"
            aria-label="Full screen"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          >
            <Maximize />
          </Button>
        </div>
      </header>

      <main className="host__stage">
        {state.status === "ended" ? (
          <div className="host__center">
            <Leaderboard players={state.leaderboard} title={state.hasQuiz ? "Final standings" : "Thanks everyone"} />
            <div className="host__end-actions">
              {state.deckId && state.sessionId && (
                <Button size="lg" variant="lime" onClick={() => downloadResults(state.deckId!, state.sessionId!)}>
                  <Download /> Download results
                </Button>
              )}
              <Button size="lg" variant="sun" onClick={() => navigate("/teach")}>
                Back to sessions
              </Button>
            </div>
          </div>
        ) : state.showLeaderboard ? (
          <div className="host__center">
            <Leaderboard players={state.leaderboard} />
          </div>
        ) : !slide ? (
          <HostLobby state={state} joinHost={joinHost} />
        ) : (
          <section className="host__slide" key={slide.id}>
            <div className="host__slide-head">
              <span className={`chip bg-${SLIDE_META[slide.type].color}`}>
                {(() => {
                  const Icon = SLIDE_META[slide.type].icon
                  return <Icon strokeWidth={3} />
                })()}
                {SLIDE_META[slide.type].label}
              </span>
              {countdown !== null && (
                <span className={cn("timer", countdown <= 5 && "timer--hot")}>
                  <Hourglass strokeWidth={3} /> {countdown}
                </span>
              )}
            </div>
            <h1 className="host__question">{slide.question || "Untitled question"}</h1>
            <div className="host__results">
              {resultsVisible ? (
                <ResultsView
                  slide={slide}
                  results={state.results!}
                  reveal={state.reveal}
                  onRemove={slide.type === "open" || slide.type === "qa" ? (id) => send({ type: "remove", responseId: id }) : undefined}
                />
              ) : (
                <div className="results-hidden">
                  {isQuiz && !state.reveal ? (
                    <>
                      <Smartphone strokeWidth={3} />
                      <p>Answer on your phone now</p>
                      <div className="quiz-preview">
                        {slide.options.map((o, i) => (
                          <span key={i} className={`chip bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`}>
                            {o || `Option ${i + 1}`}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <EyeOff strokeWidth={3} />
                      <p>Results are hidden</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {state.status === "live" && (
        <footer className="host__controls">
          <div className="host__controls-group">
            <Button variant="outline" size="icon-lg" onClick={() => go(state.index - 1)} disabled={state.index < 0} aria-label="Previous slide">
              <ArrowLeft />
            </Button>
            <span className="host__progress">
              {state.index < 0 ? "Lobby" : `${state.index + 1} of ${state.total}`}
            </span>
            {state.index < state.total - 1 ? (
              <Button variant="lime" size="lg" onClick={() => go(state.index + 1)}>
                {state.index < 0 ? (
                  <>
                    <Play /> Start
                  </>
                ) : (
                  <>
                    Next <ArrowRight />
                  </>
                )}
              </Button>
            ) : (
              <Button variant="destructive" size="lg" onClick={() => setConfirmEnd(true)}>
                <Power /> Finish
              </Button>
            )}
          </div>

          {slide && (
            <div className="host__controls-group">
              <span className="chip bg-white">
                {state.answeredCount} of {state.participantCount} answered
              </span>
              {isQuiz ? (
                <Button variant={state.reveal ? "outline" : "sun"} onClick={() => send({ type: "reveal", show: !state.reveal })}>
                  <Eye /> {state.reveal ? "Hide answer" : "Reveal answer"}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setHideResults((h) => !h)}>
                    {hideResults ? <Eye /> : <EyeOff />}
                    {hideResults ? "Show on screen" : "Hide on screen"}
                  </Button>
                  {slide.type !== "qa" && (
                    <Button variant={state.reveal ? "sky" : "outline"} onClick={() => send({ type: "reveal", show: !state.reveal })}>
                      <Smartphone /> {state.reveal ? "Shared to phones" : "Share to phones"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="host__controls-group">
            {state.hasQuiz && (
              <Button
                variant={state.showLeaderboard ? "sun" : "outline"}
                onClick={() => send({ type: "leaderboard", show: !state.showLeaderboard })}
              >
                <Crown /> Leaderboard
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => setConfirmEnd(true)} aria-label="End session">
              <Power />
            </Button>
          </div>
        </footer>
      )}

      {error && <div className="toast">{error}</div>}

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this session?</DialogTitle>
            <DialogDescription>Students will see the final screen and nobody else can join with this code.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                send({ type: "end" })
                setConfirmEnd(false)
              }}
            >
              <Power /> End session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HostLobby({ state, joinHost }: { state: RoomState; joinHost: string }) {
  const players = state.participants ?? []
  return (
    <div className="lobby">
      <div className="lobby__join">
        <p className="lobby__step">Go to</p>
        <p className="lobby__url">{joinHost}</p>
        <p className="lobby__step">and enter</p>
        <p className="lobby__code">{formatCode(state.code)}</p>
      </div>
      <div className="lobby__people">
        <h2 className="lobby__count">
          <Users strokeWidth={3} /> {players.length} {players.length === 1 ? "student" : "students"} in
        </h2>
        {players.length === 0 ? (
          <p className="results-empty">Waiting for the first brave soul</p>
        ) : (
          <div className="lobby__names">
            {players.map((p, i) => (
              <span
                key={p.id}
                className={cn("name-chip", `bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`, !p.online && "is-away")}
              >
                {p.nickname}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
