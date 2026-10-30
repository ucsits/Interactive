import { Zap } from "lucide-react"
import { Link } from "react-router-dom"

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Pulse home">
      <span className="logo__mark">
        <Zap strokeWidth={3} />
      </span>
      <span className="logo__word">Pulse</span>
    </Link>
  )
}
