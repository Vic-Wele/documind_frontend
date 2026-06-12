"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Message from "@/components/Message";

type ChatMessage = { role: string; content: string };
type BackendStatus = "checking" | "online" | "offline";
type Theme = "light" | "dark";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Stable per-browser id so each visitor gets an isolated document on the backend.
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("session_id");
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("session_id", id);
  }
  return id;
}

const SUGGESTIONS = [
  "Summarize this document in a few bullet points",
  "What are the key takeaways?",
  "Explain the main concept simply",
  "List any important dates or figures",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [indexedDoc, setIndexedDoc] = useState<{
    name: string;
    chunks: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [backend, setBackend] = useState<BackendStatus>("checking");
  const [theme, setTheme] = useState<Theme>("dark");
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Toast helper -------------------------------------------------
  const showToast = useCallback((type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // --- Sync theme state with the class set by the no-flash script ----
  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("light") ? "light" : "dark"
    );
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };

  // --- Check backend + existing index on mount ----------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/status`, {
          headers: { "X-Session-Id": getSessionId() },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setBackend("online");
        if (data.ready && data.document) {
          setIndexedDoc({ name: data.document, chunks: data.chunks });
        }
      } catch {
        if (!cancelled) setBackend("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Auto scroll to bottom on new message -------------------------
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // --- Auto-resize textarea -----------------------------------------
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question]);

  // --- File handling ------------------------------------------------
  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      showToast("err", "Please choose a PDF file.");
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const uploadFile = async () => {
    if (!file) {
      showToast("err", "No file selected.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { "X-Session-Id": getSessionId() },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      const chunks = data?.details?.chunks ?? 0;
      setIndexedDoc({ name: file.name, chunks });
      setMessages([]);
      setFile(null);
      showToast("ok", `Indexed "${file.name}" (${chunks} chunks). Ask away!`);
    } catch (err) {
      showToast("err", err instanceof Error ? err.message : "Upload error");
    } finally {
      setUploading(false);
    }
  };

  // --- Remove indexed document --------------------------------------
  const removeDocument = async () => {
    try {
      setUploading(true);
      const res = await fetch(`${API_URL}/reset`, {
        method: "POST",
        headers: { "X-Session-Id": getSessionId() },
      });
      if (!res.ok) throw new Error("Failed to remove document");
      setIndexedDoc(null);
      setFile(null);
      setMessages([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("ok", "Document removed.");
    } catch (err) {
      showToast("err", err instanceof Error ? err.message : "Remove error");
    } finally {
      setUploading(false);
    }
  };

  // --- Ask question -------------------------------------------------
  const sendQuestion = async (override?: string) => {
    const q = (override ?? question).trim();
    if (!q || loading) return;

    if (!indexedDoc) {
      showToast("err", "Upload a PDF first.");
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": getSessionId(),
        },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Error asking question");
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ ${
            err instanceof Error ? err.message : "Something went wrong."
          }`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  // ------------------------------------------------------------------
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Animated background blobs */}
      <div
        className="bg-blob h-[420px] w-[420px]"
        style={{ top: "-120px", left: "-100px", background: "var(--blob-1)" }}
      />
      <div
        className="bg-blob h-[380px] w-[380px]"
        style={{
          bottom: "-140px",
          right: "-80px",
          animationDelay: "-6s",
          background: "var(--blob-2)",
        }}
      />
      <div
        className="bg-blob h-[300px] w-[300px]"
        style={{
          top: "40%",
          right: "30%",
          animationDelay: "-11s",
          background: "var(--blob-3)",
          opacity: 0.25,
        }}
      />

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-1/2 top-6 z-50 -translate-x-1/2"
          style={{ animation: "var(--animate-fade-up)" }}
        >
          <div
            className="glass-strong rounded-full px-5 py-2.5 text-sm font-medium shadow-2xl"
            style={{ color: toast.type === "ok" ? "var(--accent)" : "#ff5c7a" }}
          >
            {toast.text}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        {/* Header */}
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="accent-grad accent-shadow flex h-11 w-11 items-center justify-center rounded-2xl text-xl">
              📄
            </div>
            <div>
              <h1 className="text-strong text-xl font-bold tracking-tight">
                DocuMind
              </h1>
              <p className="text-faint text-xs">Chat with your PDFs · RAG</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    backend === "online"
                      ? "var(--accent)"
                      : backend === "offline"
                      ? "#ff5c5c"
                      : "#eab308",
                  animation:
                    backend === "checking"
                      ? "pulse-glow 1.2s infinite"
                      : undefined,
                }}
              />
              <span className="text-soft">
                {backend === "online"
                  ? "API online"
                  : backend === "offline"
                  ? "API offline"
                  : "Connecting…"}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="glass flex h-9 w-9 items-center justify-center rounded-full text-soft transition hover:scale-105"
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                /* Sun */
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                /* Moon */
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Hero */}
        {messages.length === 0 && (
          <section
            className="mb-6 text-center"
            style={{ animation: "var(--animate-fade-up)" }}
          >
            <span className="glass text-soft mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
              Retrieval-Augmented Generation
            </span>

            <h2 className="text-strong text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Chat with your PDFs,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--accent-grad-from), var(--accent-grad-to))",
                }}
              >
                intelligently
              </span>
            </h2>

            <p className="text-soft mx-auto mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
              <span className="text-strong font-semibold">DocuMind</span> is a
              RAG-enabled chatbot that lets you upload any PDF and ask questions
              in plain English. It reads, understands, and answers straight from
              your document — with cited sources so you can trust every reply.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {[
                "📄 Upload any PDF",
                "💬 Ask in plain English",
                "📌 Cited sources",
                "⚡ Powered by GPT-4o-mini",
              ].map((f) => (
                <span
                  key={f}
                  className="glass text-soft rounded-full px-3 py-1.5 text-xs font-medium"
                >
                  {f}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Upload zone */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className="glass mb-5 rounded-2xl border-dashed p-5 transition-all"
          style={
            dragActive
              ? {
                  borderColor: "var(--accent)",
                  borderWidth: "2px",
                  background: "var(--glass-bg-strong)",
                }
              : undefined
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <div className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl">
              {indexedDoc ? "✅" : "⬆️"}
            </div>

            <div className="flex-1">
              {indexedDoc ? (
                <p className="text-soft text-sm">
                  Indexed{" "}
                  <span className="text-strong font-semibold">
                    {indexedDoc.name}
                  </span>{" "}
                  <span className="text-faint">· {indexedDoc.chunks} chunks</span>
                </p>
              ) : (
                <p className="text-soft text-sm">
                  Drag &amp; drop a PDF here, or{" "}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-accent font-semibold underline-offset-2 hover:underline"
                  >
                    browse
                  </button>
                </p>
              )}
              {file && !indexedDoc && (
                <p className="text-faint mt-1 text-xs">Selected: {file.name}</p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-ghost rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {indexedDoc ? "Replace" : "Choose File"}
              </button>

              {file && (
                <button
                  onClick={uploadFile}
                  disabled={uploading}
                  className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploading && (
                    <span
                      className="h-3.5 w-3.5 rounded-full border-2 border-current/40 border-t-current"
                      style={{ animation: "spin 0.7s linear infinite" }}
                    />
                  )}
                  {uploading ? "Indexing…" : "Upload"}
                </button>
              )}

              {indexedDoc && (
                <button
                  onClick={removeDocument}
                  disabled={uploading}
                  className="btn-danger flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Chat window */}
        <div
          ref={scrollRef}
          className="glass mb-4 flex-1 space-y-5 overflow-y-auto rounded-2xl p-5"
          style={{ minHeight: "340px", maxHeight: "calc(100vh - 360px)" }}
        >
          {messages.length === 0 && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center">
              <div className="glass flex h-16 w-16 items-center justify-center rounded-2xl text-3xl">
                💬
              </div>
              <div>
                <h2 className="text-strong text-lg font-semibold">
                  {indexedDoc
                    ? "Ask anything about your document"
                    : "Upload a PDF to get started"}
                </h2>
                <p className="text-faint mt-1 max-w-sm text-sm">
                  Answers are grounded in your document and include cited sources.
                </p>
              </div>

              {indexedDoc && (
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendQuestion(s)}
                      className="glass text-soft rounded-full px-3.5 py-1.5 text-xs transition hover:scale-[1.03]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <Message key={i} role={msg.role} content={msg.content} />
          ))}

          {loading && (
            <div
              className="flex items-center gap-3"
              style={{ animation: "var(--animate-fade-in)" }}
            >
              <div className="accent-grad on-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
                AI
              </div>
              <div className="glass-strong flex items-center gap-1.5 rounded-2xl rounded-tl-sm px-5 py-4">
                <span className="typing-dot" />
                <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="glass-strong flex items-end gap-2 rounded-2xl p-2.5">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              indexedDoc ? "Ask a question…" : "Upload a PDF to begin…"
            }
            title="Ask a question"
            rows={1}
            className="text-strong flex-1 resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-[var(--text-faint)] focus:outline-none"
          />
          <button
            onClick={() => sendQuestion()}
            disabled={!question.trim() || loading}
            className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        <p className="text-faint mt-2 text-center text-[11px]">
          Press Enter to send · Shift + Enter for a new line
        </p>
      </main>
    </div>
  );
}
