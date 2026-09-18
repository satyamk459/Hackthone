"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Policy = { id: string; policy_name: string | null; insurer_name: string | null };
type Message = { role: "user" | "assistant"; content: string; sources?: { page: number | null; section: string | null }[] };

export function FloatingChat() {
  const [authenticated, setAuthenticated] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("auto");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setAuthenticated(true);
      const response = await fetch("/api/policies/upload");
      if (response.ok) {
        const result = await response.json();
        setPolicies(result.policies ?? []);
        if (result.policies?.[0]) setSelectedPolicy(result.policies[0].id);
      }
    });
  }, []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !selectedPolicy || loading) return;
    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setLoading(true);
    const response = await fetch(`/api/policies/${selectedPolicy}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed, language }) });
    if (!response.ok || !response.body) {
      const result = await response.json().catch(() => null);
      setLoading(false);
      setError(result?.error ?? "ClaimWise could not answer this question.");
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
    const errorMarker = answer.match(/\n\n\[((?:AI error:|Development error:|ClaimWise could not|The response was interrupted)[^\]]*)\]/);
    if (errorMarker) {
      setMessages((current) => current.slice(0, -1));
      setError(errorMarker[1]);
    }
    setLoading(false);
  }

  if (!authenticated) return null;
  return <>
    <button className="floating-chat-button" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open ClaimWise AI chat">&#10022;</button>
    {open && <section className="floating-chat-panel" aria-label="ClaimWise AI chat"><header><div><strong>ClaimWise AI</strong><small>Ask about your policy</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close chat">x</button></header>{policies.length ? <><label className="chat-policy-select">Policy<select value={selectedPolicy} onChange={(event) => { setSelectedPolicy(event.target.value); setMessages([]); }}><option value="">Select a policy</option>{policies.map((policy) => <option value={policy.id} key={policy.id}>{policy.policy_name ?? policy.insurer_name ?? "Uploaded policy"}</option>)}</select></label><div className="floating-chat-messages">{messages.length === 0 && <p className="floating-chat-empty">Ask about coverage, exclusions, waiting periods, or claim documents.</p>}{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === "user" ? "You" : "ClaimWise AI"}</small><p>{message.content || (loading ? "" : "No response returned.")}</p>{message.sources?.length ? <div className="chat-sources">{message.sources.map((source, sourceIndex) => <span key={sourceIndex}>Page {source.page ?? "?"}{source.section ? ` &middot; ${source.section}` : ""}</span>)}</div> : null}</article>)}{loading && <article className="chat-message assistant typing-message"><small>ClaimWise AI</small><p><span /> <span /> <span /></p></article>}</div><form className="chat-form" onSubmit={ask}><select className="language-select" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Response language"><option value="auto">Auto</option><option value="english">English</option><option value="hindi">Hindi</option></select><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a policy question..." aria-label="Ask a policy question" /><button className="primary-button" type="submit" disabled={!selectedPolicy || loading || !question.trim()}>Ask</button></form>{error && <p className="chat-error">{error}</p>}</> : <div className="floating-chat-empty"><p>Upload a policy first to ask evidence-based questions.</p><Link href="/overview">Go to overview</Link></div>}</section>}
  </>;
}

