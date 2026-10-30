import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CloudCheck,
  Copy,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { blankSlide, convertSlide, duplicateSlide, OPTION_COLORS, OPTION_SHAPES, SLIDE_META, SLIDE_ORDER } from "@/lib/slides"
import type { Slide, SlideType } from "@/lib/types"
import { cn } from "@/lib/utils"

type SaveState = "saved" | "dirty" | "saving" | "error"

const TIME_LIMITS = [0, 10, 15, 20, 30, 45, 60, 90, 120]

export default function Editor() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [save, setSave] = useState<SaveState>("saved")
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    api
      .getDeck(id)
      .then((deck) => {
        setTitle(deck.title)
        setSlides(deck.slides ?? [])
        loaded.current = true
      })
      .catch((e) => setError(e.message))
  }, [id])

  // Autosave shortly after the teacher stops typing.
  useEffect(() => {
    if (!loaded.current || save !== "dirty" || !slides) return
    const t = window.setTimeout(async () => {
      setSave("saving")
      try {
        await api.saveDeck(id, title, slides)
        setSave((s) => (s === "saving" ? "saved" : s))
      } catch (e) {
        setError((e as Error).message)
        setSave("error")
      }
    }, 700)
    return () => window.clearTimeout(t)
  }, [id, title, slides, save])

  if (error && !slides) {
    return (
      <div className="page center-page bg-pink">
        <div className="panel panel--narrow">
          <h1 className="panel__title">Could not open this session</h1>
          <p className="panel__text">{error}</p>
          <Button variant="sun" onClick={() => navigate("/teach")}>
            Back to sessions
          </Button>
        </div>
      </div>
    )
  }
  if (!slides) {
    return (
      <div className="page center-page">
        <Loader2 className="spin big-spin" strokeWidth={3} />
      </div>
    )
  }

  const touch = () => setSave("dirty")
  const current = slides[selected]

  const updateSlide = (patch: Partial<Slide>) => {
    setSlides((list) => list!.map((s, i) => (i === selected ? { ...s, ...patch } : s)))
    touch()
  }

  const addSlide = (type: SlideType) => {
    const next = [...slides]
    next.splice(selected + 1, 0, blankSlide(type))
    setSlides(next)
    setSelected(slides.length ? selected + 1 : 0)
    setPicker(false)
    touch()
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return
    const next = [...slides]
    const [s] = next.splice(from, 1)
    next.splice(to, 0, s)
    setSlides(next)
    setSelected(to)
    touch()
  }

  const remove = (index: number) => {
    setSlides(slides.filter((_, i) => i !== index))
    setSelected(Math.max(0, Math.min(selected, slides.length - 2)))
    touch()
  }

  const duplicate = (index: number) => {
    const next = [...slides]
    next.splice(index + 1, 0, duplicateSlide(slides[index]))
    setSlides(next)
    setSelected(index + 1)
    touch()
  }

  const present = async () => {
    setLaunching(true)
    try {
      await api.saveDeck(id, title, slides)
      setSave("saved")
      const { code } = await api.startSession(id)
      navigate(`/host/${code}`)
    } catch (e) {
      setError((e as Error).message)
      setLaunching(false)
    }
  }

  return (
    <div className="page editor">
      <header className="topbar topbar--editor">
        <div className="topbar__left">
          <Button variant="outline" size="icon" onClick={() => navigate("/teach")} aria-label="Back to sessions">
            <ArrowLeft />
          </Button>
          <Logo to="/teach" />
        </div>
        <Input
          className="editor__title"
          value={title}
          aria-label="Session title"
          placeholder="Name your session"
          onChange={(e) => {
            setTitle(e.target.value)
            touch()
          }}
        />
        <div className="topbar__right">
          <span className={cn("save-state", `save-state--${save}`)}>
            {save === "saving" || save === "dirty" ? <Loader2 className="spin" /> : <CloudCheck strokeWidth={3} />}
            {save === "error" ? "Not saved" : save === "saved" ? "Saved" : "Saving"}
          </span>
          <Button variant="lime" size="lg" onClick={present} disabled={launching || !slides.length}>
            {launching ? <Loader2 className="spin" /> : <Play />}
            Present
          </Button>
        </div>
      </header>

      {error && <div className="toast" onClick={() => setError(null)}>{error}</div>}

      <div className="editor__body">
        <aside className="slide-list">
          {slides.map((s, i) => {
            const meta = SLIDE_META[s.type]
            const Icon = meta.icon
            return (
              <div key={s.id} className={cn("slide-thumb", i === selected && "is-active")} onClick={() => setSelected(i)}>
                <span className="slide-thumb__num">{i + 1}</span>
                <div className={`slide-thumb__card bg-${meta.color}`}>
                  <Icon strokeWidth={3} />
                  <p>{s.question || "Untitled question"}</p>
                </div>
                {i === selected && (
                  <div className="slide-thumb__tools" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon-xs" variant="outline" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUp />
                    </Button>
                    <Button size="icon-xs" variant="outline" onClick={() => move(i, i + 1)} disabled={i === slides.length - 1} aria-label="Move down">
                      <ArrowDown />
                    </Button>
                    <Button size="icon-xs" variant="outline" onClick={() => duplicate(i)} aria-label="Duplicate">
                      <Copy />
                    </Button>
                    <Button size="icon-xs" variant="destructive" onClick={() => remove(i)} aria-label="Delete">
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          <Button variant="sun" className="w-full" onClick={() => setPicker(true)}>
            <Plus /> Add slide
          </Button>
        </aside>

        <main className="editor__main">
          {current ? (
            <SlideForm key={current.id} slide={current} onChange={updateSlide} />
          ) : (
            <div className="empty-hero">
              <h2>No slides yet</h2>
              <p>Add your first slide to get the room talking.</p>
              <Button variant="sun" size="lg" onClick={() => setPicker(true)}>
                <Plus /> Add slide
              </Button>
            </div>
          )}
        </main>
      </div>

      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pick a slide type</DialogTitle>
            <DialogDescription>Mix them up to keep the energy high.</DialogDescription>
          </DialogHeader>
          <div className="type-picker">
            {SLIDE_ORDER.map((type) => {
              const meta = SLIDE_META[type]
              const Icon = meta.icon
              return (
                <button key={type} className={`type-tile type-tile--button bg-${meta.color}`} onClick={() => addSlide(type)}>
                  <Icon strokeWidth={3} />
                  <h3>{meta.label}</h3>
                  <p>{meta.blurb}</p>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (patch: Partial<Slide>) => void }) {
  const meta = SLIDE_META[slide.type]
  const hasOptions = slide.type === "poll" || slide.type === "quiz"

  const setOption = (i: number, value: string) => onChange({ options: slide.options.map((o, j) => (j === i ? value : o)) })
  const removeOption = (i: number) =>
    onChange({
      options: slide.options.filter((_, j) => j !== i),
      correct: slide.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
    })
  const toggleCorrect = (i: number) =>
    onChange({ correct: slide.correct.includes(i) ? slide.correct.filter((c) => c !== i) : [...slide.correct, i] })

  return (
    <div className={`slide-form slide-form--${meta.color}`}>
      <div className="slide-form__row">
        <div className="field">
          <Label>Slide type</Label>
          <Select value={slide.type} onValueChange={(v) => onChange(convertSlide(slide, v as SlideType))}>
            <SelectTrigger className="min-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_ORDER.map((t) => {
                const Icon = SLIDE_META[t].icon
                return (
                  <SelectItem key={t} value={t}>
                    <Icon strokeWidth={3} /> {SLIDE_META[t].label}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
        {slide.type === "quiz" && (
          <div className="field">
            <Label>Timer</Label>
            <Select value={String(slide.timeLimit)} onValueChange={(v) => onChange({ timeLimit: Number(v) })}>
              <SelectTrigger className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_LIMITS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t === 0 ? "No timer" : `${t} seconds`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {(slide.type === "wordcloud" || slide.type === "open" || slide.type === "qa") && (
          <div className="field">
            <Label>Entries per student</Label>
            <Select value={String(slide.maxEntries)} onValueChange={(v) => onChange({ maxEntries: Number(v) })}>
              <SelectTrigger className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? "entry" : "entries"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="field">
        <Label htmlFor="question">Question</Label>
        <Textarea
          id="question"
          className="slide-form__question"
          value={slide.question}
          maxLength={300}
          placeholder={slide.type === "qa" ? "What would you like to ask?" : "Type your question"}
          onChange={(e) => onChange({ question: e.target.value })}
        />
      </div>

      {hasOptions && (
        <div className="field">
          <Label>{slide.type === "quiz" ? "Answers (tap the check to mark the right ones)" : "Options"}</Label>
          <div className="option-list">
            {slide.options.map((opt, i) => {
              const Shape = OPTION_SHAPES[i % OPTION_SHAPES.length]
              const correct = slide.correct.includes(i)
              return (
                <div key={i} className={cn("option-row", `option-row--${OPTION_COLORS[i % OPTION_COLORS.length]}`)}>
                  <span className={`option-row__shape bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`}>
                    <Shape strokeWidth={3} />
                  </span>
                  <Input value={opt} maxLength={120} placeholder={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
                  {slide.type === "quiz" && (
                    <Button
                      size="icon"
                      variant={correct ? "lime" : "outline"}
                      onClick={() => toggleCorrect(i)}
                      aria-label={correct ? "Marked correct" : "Mark as correct"}
                    >
                      <Check />
                    </Button>
                  )}
                  <Button size="icon" variant="outline" onClick={() => removeOption(i)} disabled={slide.options.length <= 2} aria-label="Remove option">
                    <X />
                  </Button>
                </div>
              )
            })}
          </div>
          {slide.options.length < 8 && (
            <Button variant="outline" className="self-start" onClick={() => onChange({ options: [...slide.options, ""] })}>
              <Plus /> Add option
            </Button>
          )}
        </div>
      )}

      {slide.type === "scale" && (
        <div className="slide-form__grid">
          <div className="field">
            <Label>Lowest value</Label>
            <Select value={String(slide.scaleMin)} onValueChange={(v) => onChange({ scaleMin: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="field">
            <Label>Highest value</Label>
            <Select value={String(slide.scaleMax)} onValueChange={(v) => onChange({ scaleMax: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="field">
            <Label>Low end label</Label>
            <Input value={slide.minLabel} maxLength={40} onChange={(e) => onChange({ minLabel: e.target.value })} />
          </div>
          <div className="field">
            <Label>High end label</Label>
            <Input value={slide.maxLabel} maxLength={40} onChange={(e) => onChange({ maxLabel: e.target.value })} />
          </div>
        </div>
      )}

      <p className="slide-form__tip">
        <meta.icon strokeWidth={3} /> {tipFor(slide.type)}
      </p>
    </div>
  )
}

function tipFor(type: SlideType) {
  switch (type) {
    case "poll":
      return "Students can change their vote until you move on."
    case "quiz":
      return "Faster correct answers earn more points. The answer reveals itself when time runs out or everyone has answered."
    case "wordcloud":
      return "Repeated words grow bigger, so short answers work best."
    case "open":
      return "Answers appear as sticky notes. You can remove any of them while presenting."
    case "scale":
      return "Great for confidence checks before and after a lesson."
    case "qa":
      return "Students see every question and upvote the ones they care about most."
  }
}
