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
  const [language, setLanguage] = useState("auto");

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
    const response = await fetch(`/api/policies/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed, language }) });
    if (!response.ok || !response.body) {
      const result = await response.json().catch(() => null);
      setLoading(false);
      setError(result?.error ?? "Could not answer this question.");
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    setMessages((current) => [...current, { role: "assistant", content: "" }]);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message));
    }
    const errorMarker = answer.match(/\n\n\[((?:Development error:|ClaimWise could not|The response was interrupted)[^\]]*)\]/);
    if (errorMarker) {
      setMessages((current) => current.slice(0, -1));
      setError(errorMarker[1]);
    }
    setLoading(false);
  }

  return <main className="main-content"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav"><Link className="top-nav-link" href="/">▦ Overview</Link><Link className="top-nav-link" href="/policies">▱ My policies</Link><Link className="top-nav-link active" href={`/policies/${id}/chat`}>Ask ClaimWise</Link></nav></header><div className="content-wrap page-content"><p className="eyebrow">POLICY CHAT</p><h1 className="page-title">Ask about your policy.</h1><div className="chat-shell"><div className="chat-notice">Answers use the selected policy only. ClaimWise will say when the document does not contain enough evidence.</div><div className="chat-messages">{messages.length === 0 && <div className="chat-empty"><strong>What would you like to understand?</strong><span>Try asking about coverage, waiting periods, exclusions, or claim documents.</span></div>}{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === "user" ? "You" : "ClaimWise AI"}</small><p>{message.content || (loading ? "" : "No response returned.")}</p>{message.sources && message.sources.length > 0 && <div className="chat-sources">Sources: {message.sources.map((source, sourceIndex) => <span key={sourceIndex}>Page {source.page ?? "?"}{source.section ? ` · ${source.section}` : ""}</span>)}</div>}</article>)}{loading && <article className="chat-message assistant typing-message"><small>ClaimWise AI</small><p><span /> <span /> <span /></p></article>}</div><form className="chat-form" onSubmit={askQuestion}><select className="language-select" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Response language"><option value="auto">Auto</option><option value="english">English</option><option value="hindi">Hindi</option></select><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about this policy..." aria-label="Ask a question about this policy" /><button className="primary-button" type="submit" disabled={loading || !question.trim()}>Ask <span>→</span></button></form>{error && <p className="chat-error">{error}</p>}</div></div></main>;
}
