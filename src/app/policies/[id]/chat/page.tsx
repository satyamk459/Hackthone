"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Message = { role: "user" | "assistant"; content: string; sources?: { page: number | null; section: string | null }[] };

export default function PolicyChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
    });
  }, [router]);

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setLoading(true);
    const response = await fetch(`/api/policies/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(result.error ?? "Could not answer this question.");
      return;
    }
    setMessages((current) => [...current, { role: "assistant", content: result.answer, sources: result.sources }]);
  }

  return <main className="main-content"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav"><Link className="top-nav-link" href="/">▦ Overview</Link><Link className="top-nav-link" href="/policies">▱ My policies</Link><Link className="top-nav-link active" href={`/policies/${id}/chat`}>Ask ClaimWise</Link></nav></header><div className="content-wrap page-content"><p className="eyebrow">POLICY CHAT</p><h1 className="page-title">Ask about your policy.</h1><div className="chat-shell"><div className="chat-notice">Answers use the selected policy only. ClaimWise will say when the document does not contain enough evidence.</div><div className="chat-messages">{messages.length === 0 && <div className="chat-empty"><strong>What would you like to understand?</strong><span>Try asking about coverage, waiting periods, exclusions, or claim documents.</span></div>}{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === "user" ? "You" : "ClaimWise AI"}</small><p>{message.content}</p>{message.sources && message.sources.length > 0 && <div className="chat-sources">Sources: {message.sources.map((source, sourceIndex) => <span key={sourceIndex}>Page {source.page ?? "?"}{source.section ? ` · ${source.section}` : ""}</span>)}</div>}</article>)}{loading && <article className="chat-message assistant"><small>ClaimWise AI</small><p>Reading the policy...</p></article>}</div><form className="chat-form" onSubmit={askQuestion}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about this policy..." aria-label="Ask a question about this policy" /><button className="primary-button" type="submit" disabled={loading || !question.trim()}>Ask <span>→</span></button></form>{error && <p className="chat-error">{error}</p>}</div></div></main>;
}
