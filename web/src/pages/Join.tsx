import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowRight, Loader2, SearchX } from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, formatCode, savedPlayer, savePlayer } from "@/lib/api"

export default function Join() {
  const { code = "" } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [nickname, setNickname] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (savedPlayer(code)) {
      navigate(`/play/${code}`, { replace: true })
      return
    }
    api
      .sessionInfo(code)
      .then((info) => setTitle(info.title))
      .catch(() => setMissing(true))
  }, [code, navigate])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await api.join(code, nickname)
      savePlayer(code, session)
      navigate(`/play/${code}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="page center-page bg-sky">
      <Logo />
      {missing ? (
        <div className="panel panel--narrow">
          <SearchX className="panel__icon" strokeWidth={3} />
          <h1 className="panel__title">No session found</h1>
          <p className="panel__text">Code {formatCode(code)} is not live right now. Double check the big screen.</p>
          <Button size="lg" variant="sun" onClick={() => navigate("/")}>
            Try another code
          </Button>
        </div>
      ) : (
        <form className="panel panel--narrow" onSubmit={submit}>
          <span className="sticker bg-sun">Code {formatCode(code)}</span>
          <h1 className="panel__title">{title ?? <Loader2 className="spin" />}</h1>
          <p className="panel__text">Pick a nickname your teacher will recognize</p>
          <Input
            placeholder="Your nickname"
            maxLength={24}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
            aria-label="Nickname"
          />
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" size="xl" className="w-full" disabled={!nickname.trim() || busy || !title}>
            {busy ? <Loader2 className="spin" /> : <>Let me in <ArrowRight /></>}
          </Button>
        </form>
      )}
    </div>
  )
}
