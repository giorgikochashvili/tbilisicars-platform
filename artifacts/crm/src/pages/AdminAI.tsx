import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedSources?: Array<{ type: string; count?: number }>;
  warnings?: string[];
  error?: boolean;
};

// ─── Example questions ────────────────────────────────────────────────────────

const EXAMPLE_QUESTIONS = [
  "What happened today?",
  "Which bookings are unpaid?",
  "Which cars are currently available?",
  "Are there any overdue returns?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

// ─── Source badge label ───────────────────────────────────────────────────────

function sourceLabel(s: { type: string; count?: number }): string {
  const label = s.type.replace(/_/g, " ");
  return s.count !== undefined ? `${label} ×${s.count}` : label;
}

// ─── Welcome State ────────────────────────────────────────────────────────────

function WelcomeState({ onExample }: { onExample: (q: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center select-none">
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 mb-5 shadow-lg shadow-primary/5">
        <Bot className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-1 font-display tracking-tight">
        Super Admin AI
      </h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs">
        Ask anything about bookings, fleet, payments, or operations.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onExample(q)}
            className="text-left text-sm px-4 py-2.5 rounded-xl border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card hover:border-primary/30 transition-all duration-150 cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Loading Dots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%] bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[80%] bg-destructive/10 border border-destructive/20 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm text-destructive leading-relaxed">
          Something went wrong. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%] space-y-2">
        <div className="bg-card border border-border/60 px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-foreground leading-relaxed shadow-sm whitespace-pre-wrap">
          {msg.content}
        </div>

        {msg.usedSources && msg.usedSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {msg.usedSources.map((s, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-[10px] font-medium py-0.5 px-2 rounded-full bg-primary/10 text-primary border-primary/20"
              >
                {sourceLabel(s)}
              </Badge>
            ))}
          </div>
        )}

        {msg.warnings && msg.warnings.length > 0 && (
          <div className="flex items-start gap-1.5 px-1">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-yellow-500/90 leading-snug">
              {msg.warnings.join(" ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAI() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const conversationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = conversationRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/admin-ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: trimmed }),
        });

        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "assistant", content: "", error: true },
          ]);
        } else {
          const assistantMsg: ChatMessage = {
            id: newId(),
            role: "assistant",
            content: data.answer ?? "No answer returned.",
            usedSources: data.usedSources,
            warnings: data.warnings?.length ? data.warnings : undefined,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", content: "", error: true },
        ]);
      } finally {
        setIsLoading(false);
        textareaRef.current?.focus();
      }
    },
    [isLoading],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleExample = (q: string) => {
    sendMessage(q);
  };

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 border border-primary/20 p-2 rounded-xl">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight font-display">
              Super Admin AI
            </h1>
            <p className="text-xs text-muted-foreground">
              Grounded answers from live CRM data · Read-only
            </p>
          </div>
        </div>
      </div>

      {/* Conversation area */}
      <div
        ref={conversationRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Admin AI"
        className="flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          <WelcomeState onExample={handleExample} />
        ) : (
          <div className="px-4 py-5 max-w-2xl mx-auto w-full">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-card border border-border/60 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                  <ThinkingDots />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border/40 bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto w-full flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={2}
            placeholder="Ask anything about operations, bookings, fleet…"
            aria-label="Message to Admin AI"
            className="flex-1 resize-none rounded-xl border border-border/60 bg-background/80 text-sm text-foreground placeholder:text-muted-foreground/60 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 disabled:opacity-50 transition-colors leading-relaxed"
            style={{ minHeight: "64px", maxHeight: "160px" }}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-xl shadow-sm mb-0.5"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-center mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
