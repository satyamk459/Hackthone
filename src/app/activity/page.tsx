import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageFrame } from "@/components/PageFrame";

export default async function ActivityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return notFound();
  const [{ data: documents }, { data: events }] = await Promise.all([
    supabase.from("policy_documents").select("id, policy_id, file_name, mime_type, file_size, processing_status, uploaded_at, processed_at, policies(policy_name, insurer_name)").eq("user_id", auth.user.id).order("uploaded_at", { ascending: false }),
    supabase.from("activity_history").select("id, policy_id, event_type, event_data, created_at, policies(policy_name, insurer_name)").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const documentItems = (documents ?? []).map((document) => ({ date: document.uploaded_at, title: "Document uploaded", text: `${document.file_name}  -  ${document.processing_status}`, href: `/policies/${document.policy_id}/analysis` }));
  const eventItems = (events ?? []).map((event) => { const policy = Array.isArray(event.policies) ? event.policies[0] : event.policies; return { date: event.created_at, title: event.event_type === "analysis_completed" ? "Analysis completed" : event.event_type === "question_asked" ? "Question asked" : event.event_type.replaceAll("_", " "), text: `${policy?.policy_name ?? "Policy"}${event.event_data?.question ? `  -  ${event.event_data.question}` : ""}`, href: `/policies/${event.policy_id}/analysis` }; });
  const activity = [...documentItems, ...eventItems].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return <PageFrame eyebrow="WORKSPACE LOG" title="Activity history"><p className="intro history-intro">Every uploaded document, analysis result, and policy question is saved here.</p><div className="panel activity-page-panel"><div className="timeline">{activity.length ? activity.map((item, index) => <div className="timeline-item" key={`${item.date}-${index}`}><span className="timeline-dot"></span><div><small>{new Date(item.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small><strong>{item.title}</strong><p>{item.text}</p><Link className="history-link" href={item.href}>Open details -&gt;</Link></div></div>) : <p className="empty-copy">No uploaded documents or activity yet.</p>}</div><Link className="outline-button" href="/overview">Back to overview</Link></div></PageFrame>;
}

