import { Check, ChevronUp, Trash2 } from "lucide-react"
import { OPTION_COLORS, OPTION_SHAPES } from "@/lib/slides"
import type { Results, Slide } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  slide: Slide
  results: Results
  reveal: boolean
  compact?: boolean
  onVote?: (id: string) => void
  onRemove?: (id: string) => void
}

export function ResultsView({ slide, results, reveal, compact, onVote, onRemove }: Props) {
  switch (slide.type) {
    case "poll":
    case "quiz":
      return <OptionBars slide={slide} results={results} reveal={reveal} compact={compact} />
    case "scale":
      return <ScaleBars slide={slide} results={results} compact={compact} />
    case "wordcloud":
      return <WordCloud results={results} compact={compact} />
    case "open":
      return <Notes results={results} onRemove={onRemove} compact={compact} />
    case "qa":
      return <Questions results={results} onVote={onVote} onRemove={onRemove} />
  }
}

function OptionBars({ slide, results, reveal, compact }: { slide: Slide; results: Results; reveal: boolean; compact?: boolean }) {
  const max = Math.max(1, ...results.counts)
  const sum = results.counts.reduce((a, b) => a + b, 0)
  const showCorrect = slide.type === "quiz" && reveal
  return (
    <div className={cn("bars", compact && "bars--compact")}>
      {slide.options.map((opt, i) => {
        const count = results.counts[i] ?? 0
        const Shape = OPTION_SHAPES[i % OPTION_SHAPES.length]
        const correct = slide.correct.includes(i)
        const pct = sum ? Math.round((count / sum) * 100) : 0
        return (
          <div
            key={i}
            className={cn("bars__item", showCorrect && !correct && "is-dim")}
            style={{ "--bar": `${(count / max) * 100}%` } as React.CSSProperties}
          >
            <div className="bars__track">
              <span className="bars__count">{compact ? `${pct}%` : count}</span>
              <div className={cn("bars__fill", `bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`)} />
            </div>
            <div className="bars__label">
              <Shape className="bars__shape" strokeWidth={3} />
              <span>{opt || `Option ${i + 1}`}</span>
              {showCorrect && correct && <Check className="bars__check" strokeWidth={4} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScaleBars({ slide, results, compact }: { slide: Slide; results: Results; compact?: boolean }) {
  const max = Math.max(1, ...results.counts)
  return (
    <div className={cn("scale-result", compact && "scale-result--compact")}>
      <div className="scale-result__avg">
        <span className="scale-result__num">{results.total ? results.average.toFixed(1) : "0"}</span>
        <span className="scale-result__caption">Average from {results.total} {results.total === 1 ? "answer" : "answers"}</span>
      </div>
      <div className="bars bars--scale">
        {results.counts.map((count, i) => (
          <div key={i} className="bars__item" style={{ "--bar": `${(count / max) * 100}%` } as React.CSSProperties}>
            <div className="bars__track">
              <span className="bars__count">{count}</span>
              <div className="bars__fill bg-tangerine" />
            </div>
            <div className="bars__label bars__label--center">{slide.scaleMin + i}</div>
          </div>
        ))}
      </div>
      {(slide.minLabel || slide.maxLabel) && (
        <div className="scale-result__ends">
          <span>{slide.minLabel}</span>
          <span>{slide.maxLabel}</span>
        </div>
      )}
    </div>
  )
}

function WordCloud({ results, compact }: { results: Results; compact?: boolean }) {
  if (!results.words.length) return <Empty text="Words will pop up here as they arrive" />
  const max = Math.max(...results.words.map((w) => w.count))
  const min = compact ? 1.1 : 1.8
  const range = compact ? 1.8 : 4.5
  return (
    <div className={cn("cloud", compact && "cloud--compact")}>
      {results.words.slice(0, 60).map((w, i) => {
        const size = min + (max > 1 ? ((w.count - 1) / (max - 1)) * range : range / 2)
        return (
          <span
            key={w.text.toLowerCase()}
            className={cn("cloud__word", `cloud__word--${OPTION_COLORS[i % OPTION_COLORS.length]}`)}
            style={{ fontSize: `${size}rem`, rotate: i % 5 === 3 ? "-4deg" : i % 7 === 2 ? "3deg" : "0deg" }}
          >
            {w.text}
          </span>
        )
      })}
    </div>
  )
}

function Notes({ results, onRemove, compact }: { results: Results; onRemove?: (id: string) => void; compact?: boolean }) {
  if (!results.entries.length) return <Empty text="Answers will land here like sticky notes" />
  return (
    <div className={cn("notes", compact && "notes--compact")}>
      {results.entries.map((e, i) => (
        <div key={e.id} className={cn("note", `bg-${OPTION_COLORS[i % OPTION_COLORS.length]}`, i % 2 ? "note--tilt-r" : "note--tilt-l")}>
          <p>{e.text}</p>
          {onRemove && (
            <button className="note__remove" onClick={() => onRemove(e.id)} aria-label="Remove answer">
              <Trash2 strokeWidth={3} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Questions({ results, onVote, onRemove }: { results: Results; onVote?: (id: string) => void; onRemove?: (id: string) => void }) {
  if (!results.entries.length) return <Empty text="No questions yet, be the brave first one" />
  return (
    <ol className="questions">
      {results.entries.map((e) => (
        <li key={e.id} className={cn("question", e.mine && "question--mine")}>
          {onVote ? (
            <button className={cn("question__vote", e.voted && "is-on")} onClick={() => onVote(e.id)} aria-label="Upvote question">
              <ChevronUp strokeWidth={4} />
              <span>{e.votes}</span>
            </button>
          ) : (
            <div className="question__vote is-static">
              <ChevronUp strokeWidth={4} />
              <span>{e.votes}</span>
            </div>
          )}
          <p className="question__text">{e.text}</p>
          {onRemove && (
            <button className="question__remove" onClick={() => onRemove(e.id)} aria-label="Remove question">
              <Trash2 strokeWidth={3} />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="results-empty">{text}</div>
}
