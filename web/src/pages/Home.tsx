import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Presentation, Sparkles } from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SLIDE_META, SLIDE_ORDER } from "@/lib/slides"

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const digits = code.replace(/\D/g, "").slice(0, 6)

  return (
    <div className="page home">
      <header className="topbar">
        <Logo />
        <Button variant="outline" onClick={() => navigate("/teach")}>
          <Presentation />
          I am a teacher
        </Button>
      </header>

      <main className="home__hero">
        <section className="home__pitch">
          <span className="sticker bg-lime">
            <Sparkles strokeWidth={3} /> Free for every classroom
          </span>
          <h1 className="home__headline">
            Make every lesson <mark className="bg-sun">loud</mark>.
          </h1>
          <p className="home__lede">
            Polls, quizzes, word clouds, scales and live Q&A. Students join from any phone in seconds, no account needed.
          </p>
          <div className="home__ctas">
            <Button size="lg" variant="tangerine" onClick={() => navigate("/teach")}>
              Host a session
              <ArrowRight />
            </Button>
          </div>
        </section>

        <form
          className="join-card"
          onSubmit={(e) => {
            e.preventDefault()
            if (digits.length === 6) navigate(`/join/${digits}`)
          }}
        >
          <h2 className="join-card__title">Got a code?</h2>
          <p className="join-card__hint">Type the six digits on the big screen</p>
          <Input
            className="join-card__input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="123 456"
            aria-label="Join code"
            value={digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <Button type="submit" size="xl" variant="sun" className="w-full" disabled={digits.length !== 6}>
            Jump in
            <ArrowRight />
          </Button>
        </form>
      </main>

      <section className="home__types">
        {SLIDE_ORDER.map((type) => {
          const meta = SLIDE_META[type]
          const Icon = meta.icon
          return (
            <div key={type} className={`type-tile bg-${meta.color}`}>
              <Icon strokeWidth={3} />
              <h3>{meta.label}</h3>
              <p>{meta.blurb}</p>
            </div>
          )
        })}
      </section>
    </div>
  )
}
