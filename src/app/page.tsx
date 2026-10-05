// src/app/page.tsx
"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";

/* ── Types ─────────────────────────────────────────────────── */
interface Source {
  chunkId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  distance: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
}

/* ── Suggested questions ───────────────────────────────────── */
const SUGGESTIONS = [
  "What are first-line treatments for hypertension?",
  "Describe the pathophysiology of diabetes mellitus",
  "What are the WHO guidelines for asthma management?",
];

/* ── Icon Components ───────────────────────────────────────── */
function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v1H8V6a4 4 0 0 1 4-4z" />
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9" cy="13" r="1.5" fill="currentColor" />
      <circle cx="15" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}

/* ── Main Component ────────────────────────────────────────── */
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* auto-scroll to latest message */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  /* ── Submit handler ──────────────────────────────────────── */
  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    setError(null);
    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: q,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ??
            `Request failed (${res.status})`
        );
      }

      const data = (await res.json()) as {
        question: string;
        results: Source[];
      };

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          data.results.length > 0
            ? `Found ${data.results.length} relevant passage${data.results.length === 1 ? "" : "s"} from the knowledge base.`
            : "No relevant passages found. Try rephrasing your question or ensure documents have been ingested.",
        sources: data.results,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    handleSubmit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-icon">
          <CrossIcon />
        </div>
        <div className="header-text">
          <h1>Healthcare Knowledge Navigator</h1>
          <p>Evidence-based retrieval from clinical guidelines</p>
        </div>
      </header>

      {/* Chat Area */}
      <div className="chat-area">
        {messages.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="empty-icon">
              <SearchIcon />
            </div>
            <h2>Ask a medical question</h2>
            <p>
              Search across clinical guidelines and research papers.
              Results are ranked by semantic relevance.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => handleSubmit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message message--${msg.role}`}
              >
                <div className="message-avatar">
                  {msg.role === "user" ? "You" : <BotIcon />}
                </div>
                <div className="message-body">
                  <div className="message-bubble">{msg.text}</div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources">
                      <span className="sources-label">
                        Retrieved Sources
                      </span>
                      {msg.sources.map((src, idx) => (
                        <div key={src.chunkId} className="source-card">
                          <div className="source-card-header">
                            <span className="source-badge">
                              Chunk {idx + 1}
                            </span>
                            <span className="source-distance">
                              dist: {Number(src.distance).toFixed(4)}
                            </span>
                          </div>
                          <p className="source-content">{src.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message message--assistant">
                <div className="message-avatar">
                  <BotIcon />
                </div>
                <div className="message-body">
                  <div className="message-bubble">
                    <div className="loading-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="error-toast">{error}</div>}
          </>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Bar */}
      <form className="input-bar" onSubmit={onFormSubmit}>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a medical question…"
            rows={1}
            disabled={loading}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || loading}
            aria-label="Send question"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}
