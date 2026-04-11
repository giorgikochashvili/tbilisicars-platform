import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";

interface ChatAction {
  type: "link" | "external";
  label: string;
  href: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  actions?: ChatAction[];
}

const WELCOME: Message = {
  role: "assistant",
  text: "Hello! I'm the Tbilisi Cars assistant. I can help with questions about our car rental service in Georgia — locations, requirements, booking, and more. How can I help you today?",
  actions: [],
};

const QUICK_ACTIONS = [
  "Find a car",
  "Airport pickup",
  "Rental requirements",
  "Contact support",
];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setLoading(true);

    try {
      const res = await fetch("/api/public/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) throw new Error("request failed");

      const data = (await res.json()) as { reply: string; actions?: ChatAction[] };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply, actions: data.actions ?? [] },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, I couldn't connect right now. Please try again or contact our team directly.",
          actions: [
            { type: "external", label: "Email Us", href: "mailto:reservations@tbilisicars.com" },
            { type: "external", label: "Call Us", href: "tel:+995557376363" },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showQuickActions = messages.length === 1;

  return (
    <>
      {/* Floating toggle button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[9999] flex items-center gap-2 bg-primary hover:bg-accent text-white px-4 py-3 rounded-full shadow-lg shadow-primary/30 transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Open chat"
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold pr-0.5">Need help?</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-[9999] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: "min(380px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 80px))" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white leading-none">Tbilisi Cars</div>
              <div className="text-[11px] text-green-400 mt-0.5">● Online · 24/7 support</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-secondary/40 transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: "contain" }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {/* Bubble */}
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-tr-sm"
                      : "bg-secondary/40 text-white rounded-tl-sm border border-border/60"
                  }`}
                >
                  {msg.text}
                </div>

                {/* Action chips below assistant messages */}
                {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                    {msg.actions.map((action, ai) => (
                      <a
                        key={ai}
                        href={action.href}
                        target={action.type === "external" ? "_blank" : undefined}
                        rel={action.type === "external" ? "noopener noreferrer" : undefined}
                        className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                      >
                        {action.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Quick actions (only shown before first user message) */}
            {showQuickActions && (
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa}
                    type="button"
                    onClick={() => sendMessage(qa)}
                    disabled={loading}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground hover:text-primary bg-secondary/20 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {qa}
                  </button>
                ))}
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-start">
                <div className="bg-secondary/40 border border-border/60 text-muted-foreground px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="shrink-0 border-t border-border px-3 py-3 flex gap-2 items-end bg-card">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Type a message…"
              className="flex-1 resize-none bg-secondary/30 border border-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 disabled:opacity-50 leading-snug max-h-28 overflow-y-auto"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
