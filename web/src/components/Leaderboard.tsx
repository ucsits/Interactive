import { Crown, Medal } from "lucide-react"
import type { Player } from "@/lib/types"
import { cn } from "@/lib/utils"

const PODIUM = ["bg-sun", "bg-sky", "bg-pink"]

export function Leaderboard({ players, highlight, title = "Leaderboard" }: { players: Player[]; highlight?: string; title?: string }) {
  return (
    <div className="board">
      <h2 className="board__title">
        <Crown strokeWidth={3} />
        {title}
      </h2>
      {players.length === 0 ? (
        <p className="results-empty">Nobody has scored yet</p>
      ) : (
        <ol className="board__list">
          {players.map((p, i) => (
            <li
              key={p.id}
              className={cn("board__row", PODIUM[i] ?? "bg-white", p.id === highlight && "is-me")}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="board__rank">{i < 3 ? <Medal strokeWidth={3} /> : i + 1}</span>
              <span className="board__name">{p.nickname}</span>
              <span className="board__score">{p.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
