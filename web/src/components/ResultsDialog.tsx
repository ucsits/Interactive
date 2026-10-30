import { useEffect, useState } from "react"
import { Download, Loader2, Radio, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, downloadResults, formatCode } from "@/lib/api"
import type { Deck, SessionSummary } from "@/lib/types"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

export function ResultsDialog({ deck, onClose }: { deck: Deck | null; onClose: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSessions(null)
    setError(null)
    if (deck) api.listSessions(deck.id).then(setSessions).catch((e) => setError(e.message))
  }, [deck])

  const download = async (s: SessionSummary) => {
    if (!deck) return
    setBusy(s.id)
    try {
      await downloadResults(deck.id, s.id)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  return (
    <Dialog open={!!deck} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="results-dialog">
        <DialogHeader>
          <DialogTitle>Results for {deck?.title}</DialogTitle>
          <DialogDescription>
            Each file lists every student with their display name, NRP and answers. It opens in Excel or Google Sheets.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="form-error">{error}</p>}
        {sessions === null ? (
          !error && <Loader2 className="spin" />
        ) : sessions.length === 0 ? (
          <p className="results-empty">Present this deck once and its results show up here.</p>
        ) : (
          <ul className="results-dialog__list">
            {sessions.map((s) => (
              <li key={s.id} className="results-dialog__item">
                <div>
                  <p className="results-dialog__date">{dateFormat.format(s.createdAt)}</p>
                  <p className="results-dialog__meta">
                    {s.status === "live" && (
                      <span className="chip bg-tomato">
                        <Radio strokeWidth={3} /> Live
                      </span>
                    )}
                    <span>Code {formatCode(s.code)}</span>
                    <span>
                      <Users strokeWidth={3} /> {s.participantCount}
                    </span>
                  </p>
                </div>
                <Button variant="lime" onClick={() => download(s)} disabled={busy === s.id || s.participantCount === 0}>
                  {busy === s.id ? <Loader2 className="spin" /> : <Download />} CSV
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
