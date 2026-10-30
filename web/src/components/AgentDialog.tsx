import { useState } from "react"
import { Check, Copy, Eye, EyeOff, FileCode, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { teacherKey } from "@/lib/api"

function agentPrompt(origin: string, key: string) {
  return [
    "Please build a live classroom session for me on UCS Interactive.",
    `Read the guide at ${origin}/llms.txt first. The full OpenAPI spec is at ${origin}/api/openapi.json`,
    `Send my teacher key in the X-Teacher-Key header. My key is ${key}`,
    "Keep the key private and never show it to students.",
    "Create one deck with all slides in a single POST /api/decks call, then give me the edit link it points to.",
    "",
    "The session should be about ",
  ].join("\n")
}

function CopyButton({ text, label, variant }: { text: string; label: string; variant: "sun" | "outline" }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked, the text is still selectable on screen.
    }
  }
  return (
    <Button variant={variant} onClick={copy}>
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  )
}

export function AgentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [showKey, setShowKey] = useState(false)
  const key = teacherKey()
  const origin = location.origin
  const prompt = agentPrompt(origin, key)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="agent-dialog">
        <DialogHeader>
          <DialogTitle>Let your AI build slides</DialogTitle>
          <DialogDescription>
            Paste the prompt into ChatGPT, Claude or any agent that can call web APIs, then finish the last line with
            your topic. Decks it makes show up here.
          </DialogDescription>
        </DialogHeader>

        <div className="agent-dialog__block">
          <p className="agent-dialog__label">Prompt for your AI</p>
          <pre className="agent-dialog__prompt">{showKey ? prompt : prompt.replace(key, "•".repeat(12))}</pre>
          <CopyButton text={prompt} label="Copy prompt" variant="sun" />
        </div>

        <div className="agent-dialog__block">
          <p className="agent-dialog__label">Your teacher key</p>
          <div className="agent-dialog__key">
            <code>{showKey ? key : "•".repeat(24)}</code>
            <Button variant="outline" size="icon" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? "Hide key" : "Show key"}>
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton text={key} label="Copy key" variant="outline" />
          </div>
          <p className="agent-dialog__hint">
            Anyone with this key can edit your sessions. Only give it to tools you trust.
          </p>
        </div>

        <div className="agent-dialog__links">
          <Button variant="outline" asChild>
            <a href="/api/docs" target="_blank" rel="noreferrer">
              <FileCode /> API docs
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/llms.txt" target="_blank" rel="noreferrer">
              <FileText /> Agent guide
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
