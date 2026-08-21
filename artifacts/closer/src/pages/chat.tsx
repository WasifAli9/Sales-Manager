import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Zap, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

const STARTERS = [
  "What's my highest-leverage move this week across all 6 products?",
  "I've been building features instead of selling. What do I do now?",
  "How do I get my first 10 customers for SmartPlan AI in 30 days?",
  "Which of my 6 products should I go all-in on right now and why?",
  "Write me a cold outreach strategy for BidShield. What's the play?",
]

function DirectorBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  // Render **bold** markdown inline
  const parts = content.split(/(\*\*[^*]+\*\*)/g)
  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center mt-0.5">
        <Zap className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 bg-card border border-border/30 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-foreground">
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i} className="font-bold text-foreground">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
        {streaming && (
          <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed font-medium">
        {content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
        <Zap className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-card border border-border/30 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const userMsg: Message = { role: "user", content: trimmed }
      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setIsStreaming(true)

      // Placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", streaming: true },
      ])

      abortRef.current = new AbortController()

      try {
        const res = await fetch(`${BASE}/api/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) throw new Error("Stream failed")

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6)
            if (payload === "[DONE]") break
            try {
              const { delta, error } = JSON.parse(payload) as {
                delta?: string
                error?: string
              }
              if (error) throw new Error(error)
              if (delta) {
                fullContent += delta
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = {
                    role: "assistant",
                    content: fullContent,
                    streaming: true,
                  }
                  return next
                })
              }
            } catch {
              // skip malformed line
            }
          }
        }

        // Mark stream complete
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: fullContent }
          return next
        })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — leave partial message
          setMessages((prev) => {
            const next = [...prev]
            if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], streaming: false }
            return next
          })
        } else {
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = {
              role: "assistant",
              content: "Something went wrong. Try again.",
            }
            return next
          })
        }
      }

      setIsStreaming(false)
    },
    [messages, isStreaming],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    setMessages([])
    setInput("")
    setIsStreaming(false)
  }

  return (
    <div className="flex flex-col h-full pt-4 pb-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">
              The Director
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              $100M SaaS exit · no bullshit
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Messages or empty state */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest text-center">
              Ask anything about your business
            </p>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left text-sm text-muted-foreground bg-card border border-border/30 rounded-2xl px-4 py-3 hover:border-primary/40 hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <>
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserBubble key={i} content={msg.content} />
              ) : msg.content === "" && msg.streaming ? (
                <TypingIndicator key={i} />
              ) : (
                <DirectorBubble
                  key={i}
                  content={msg.content}
                  streaming={msg.streaming}
                />
              ),
            )}
          </>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/30">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the director…"
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-2xl bg-card border-border/30 text-sm",
              "focus-visible:ring-primary/50 min-h-[44px] max-h-32 py-3 px-4",
            )}
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="shrink-0 h-11 w-11 rounded-2xl bg-primary text-primary-foreground"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
