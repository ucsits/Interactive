import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Layers, Loader2, Pencil, Play, Plus, Radio, Trash2 } from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, formatCode } from "@/lib/api"
import { TEMPLATES, templateSlides } from "@/lib/slides"
import type { Deck } from "@/lib/types"

const CARD_COLORS = ["bg-sun", "bg-blurple", "bg-tangerine", "bg-lime", "bg-sky", "bg-pink"]

export default function Dashboard() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [doomed, setDoomed] = useState<Deck | null>(null)

  useEffect(() => {
    api.listDecks().then(setDecks).catch((e) => setError(e.message))
  }, [])

  const create = async (template?: (typeof TEMPLATES)[number]) => {
    setBusy(template?.title ?? "blank")
    try {
      const deck = await api.createDeck(template?.title ?? "Untitled session")
      if (template) await api.saveDeck(deck.id, deck.title, templateSlides(template.slides))
      navigate(`/teach/${deck.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  const present = async (deck: Deck) => {
    if (deck.liveCode) {
      navigate(`/host/${deck.liveCode}`)
      return
    }
    setBusy(deck.id)
    try {
      const { code } = await api.startSession(deck.id)
      navigate(`/host/${code}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!doomed) return
    await api.deleteDeck(doomed.id).catch((e) => setError(e.message))
    setDecks((d) => d?.filter((x) => x.id !== doomed.id) ?? null)
    setDoomed(null)
  }

  return (
    <div className="page dashboard">
      <header className="topbar">
        <Logo />
        <Button variant="tangerine" onClick={() => create()} disabled={!!busy}>
          {busy === "blank" ? <Loader2 className="spin" /> : <Plus />}
          New session
        </Button>
      </header>

      <main className="container">
        <h1 className="page-title">Your sessions</h1>
        {error && <p className="form-error">{error}</p>}

        {decks === null ? (
          <Loader2 className="spin big-spin" strokeWidth={3} />
        ) : decks.length === 0 ? (
          <div className="empty-hero">
            <Layers strokeWidth={3} />
            <h2>Nothing here yet</h2>
            <p>Start blank or grab a template below. You can go live in under a minute.</p>
          </div>
        ) : (
          <div className="deck-grid">
            {decks.map((deck, i) => (
              <article key={deck.id} className={`deck-card ${CARD_COLORS[i % CARD_COLORS.length]}`}>
                {deck.liveCode && (
                  <span className="sticker bg-tomato deck-card__live">
                    <Radio strokeWidth={3} /> Live {formatCode(deck.liveCode)}
                  </span>
                )}
                <h2 className="deck-card__title">{deck.title}</h2>
                <p className="deck-card__meta">
                  {deck.slideCount} {deck.slideCount === 1 ? "slide" : "slides"}
                </p>
                <div className="deck-card__actions">
                  <Button variant="default" onClick={() => present(deck)} disabled={busy === deck.id}>
                    {busy === deck.id ? <Loader2 className="spin" /> : <Play />}
                    {deck.liveCode ? "Resume" : "Present"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => navigate(`/teach/${deck.id}`)} aria-label="Edit">
                    <Pencil />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setDoomed(deck)} aria-label="Delete">
                    <Trash2 />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <h2 className="section-title">Start from a template</h2>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.title} className={`template-card bg-${t.color}`} onClick={() => create(t)} disabled={!!busy}>
              <span className="template-card__count">{t.slides.length} slides</span>
              <h3>{t.title}</h3>
              <p>{t.blurb}</p>
              {busy === t.title && <Loader2 className="spin" />}
            </button>
          ))}
        </div>
      </main>

      <Dialog open={!!doomed} onOpenChange={(open) => !open && setDoomed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {doomed?.title} and all of its results will be gone for good.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoomed(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove}>
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
