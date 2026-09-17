import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageFrame } from "@/components/PageFrame";

type Finding = { name?: string; title?: string; value?: string; details?: string; summary?: string; page?: number | null };
type Analysis = { insurer_name?: string | null; policy_name?: string | null; policy_number?: string | null; policy_type?: string | null; sum_insured?: string | null; premium?: string | null; start_date?: string | null; end_date?: string | null; waiting_periods?: Finding[]; benefits?: Finding[]; exclusions?: Finding[]; limits?: Finding[]; claim_requirements?: Finding[]; important_clauses?: Finding[]; recommended_actions?: string[]; review_flags?: string[] };

function valueOrMissing(value: unknown) { return value === null || value === undefined || value === "" ? "Not found in uploaded document" : String(value); }

function FindingList({ items, limits = false }: { items: Finding[]; limits?: boolean }) {
  if (!items.length) return <p className="empty-copy">Not found in the uploaded document.</p>;
  return <div className="finding-list">{items.map((item, index) => <article className="finding-item" key={`${item.name ?? item.title ?? "finding"}-${index}`}><div><strong>{item.name ?? item.title ?? "Policy finding"}</strong><p>{limits ? item.value ?? item.details ?? "Not found" : item.details ?? item.summary ?? item.value ?? "Not found"}</p></div>{item.page ? <span className="source-pill">Page {item.page}</span> : <span className="source-pill muted-pill">Page not found</span>}</article>)}</div>;
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return notFound();
  const [{ data: policy }, { data: document }, { data: savedAnalysis }] = await Promise.all([
    supabase.from("policies").select("policy_name, insurer_name, policy_number, policy_type, status").eq("id", id).eq("user_id", auth.user.id).single(),
    supabase.from("policy_documents").select("file_name, processing_status, uploaded_at, processing_error").eq("policy_id", id).eq("user_id", auth.user.id).order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("policy_analysis").select("analysis_json, model_name, created_at").eq("policy_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!policy) return notFound();
  const analysis = (savedAnalysis?.analysis_json ?? {}) as Analysis;
  const fields = [["Insurer", analysis.insurer_name ?? policy.insurer_name], ["Policy name", analysis.policy_name ?? policy.policy_name], ["Policy type", analysis.policy_type ?? policy.policy_type], ["Policy number", analysis.policy_number ?? policy.policy_number], ["Sum insured", analysis.sum_insured], ["Premium", analysis.premium], ["Policy start", analysis.start_date], ["Policy end", analysis.end_date]];
  const uploadedAt = document ? new Date(document.uploaded_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "No document uploaded";
  const status = document?.processing_status ?? policy.status;
  return <PageFrame eyebrow="DOCUMENT INTELLIGENCE" title="Policy analysis"><div className="policy-workspace-header"><div><p className="intro">{document?.file_name ?? "Uploaded policy document"} · Uploaded {uploadedAt}</p><span className={`verified ${status === "failed" ? "failed-badge" : ""}`}><span>{status === "completed" ? "✓" : "!"}</span> {status === "completed" ? "Analysis complete" : status}</span></div><Link className="outline-button" href={`/policies/${id}`}>← Policy overview</Link></div>{document?.processing_status === "failed" && <div className="analysis-alert"><strong>Analysis needs attention.</strong><span>{document.processing_error ?? "The document could not be analyzed."}</span></div>}<section className="panel analysis-page-panel results-panel"><div className="results-heading"><div><p className="eyebrow">WHAT WE FOUND</p><h2>Document summary</h2></div><span className="source-note">Source: {document?.file_name ?? "uploaded document"}</span></div><div className="analysis-grid result-fields">{fields.map(([label, value]) => <div className="analysis-item" key={label}><small>{label}</small><strong className={!value ? "not-found" : ""}>{valueOrMissing(value)}</strong><span>{value ? "Found in uploaded document" : "Needs review"}</span></div>)}</div></section><section className="results-two-column"><div className="panel result-section"><h2>Coverage and benefits</h2><FindingList items={analysis.benefits ?? []} /></div><div className="panel result-section"><h2>Limits and waiting periods</h2><FindingList items={analysis.limits ?? []} limits /><FindingList items={analysis.waiting_periods ?? []} /></div><div className="panel result-section"><h2>Exclusions</h2><FindingList items={analysis.exclusions ?? []} /></div><div className="panel result-section"><h2>Claim requirements</h2><FindingList items={analysis.claim_requirements ?? []} /></div></section><section className="results-two-column"><div className="panel result-section action-section"><h2>What you should do next</h2>{analysis.recommended_actions?.length ? <ol>{analysis.recommended_actions.map((action, index) => <li key={index}>{action}</li>)}</ol> : <p className="empty-copy">No specific actions were found. Review the policy details and ask ClaimWise a question.</p>}</div><div className="panel result-section"><h2>Important findings</h2>{analysis.review_flags?.length ? <ul>{analysis.review_flags.map((flag, index) => <li key={index}>{flag}</li>)}</ul> : <p className="empty-copy">No additional review flags were identified.</p>}</div></section><section className="analysis-footer-actions"><Link className="primary-button" href={`/policies/${id}/chat`}>Ask ClaimWise about this document <span>→</span></Link><Link className="outline-button" href="/activity">View document history</Link></section></PageFrame>;
}
