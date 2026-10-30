import { Zap } from "lucide-react"
import { Link } from "react-router-dom"

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="UCS Interactive home">
      <span className="logo__mark">
        <Zap strokeWidth={3} />
      </span>
      <span className="logo__word">
        UCS <span className="logo__sub">Interactive</span>
      </span>
    </Link>
  )
}
