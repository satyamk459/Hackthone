import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageFrame } from "@/components/PageFrame";
import { DeletePolicyButton } from "@/components/DeletePolicyButton";

export default async function PoliciesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <PageFrame eyebrow="YOUR COVER" title="My policies"><div className="empty-state"><h2>Sign in to view your policies</h2><p>Your policies and analysis history are private to your account.</p><Link className="primary-button" href="/login">Sign in</Link></div></PageFrame>;
  const { data: policies } = await supabase.from("policies").select("id, insurer_name, policy_name, policy_number, policy_type, status").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  return <PageFrame eyebrow="YOUR COVER" title="My policies"><div className="page-toolbar"><p className="intro">Every policy has its own workspace, documents, and history.</p></div>{policies?.length ? <section className="policy-grid full-policy-grid">{policies.map((policy, index) => <article className="policy-card" key={policy.id}><div className={`policy-logo ${index % 2 === 0 ? "orange" : "blue"}`}>{(policy.insurer_name ?? "P").slice(0, 2)}</div><div className="policy-status"><span className={`status-dot ${policy.status === "completed" ? "done" : "processing"}`}></span>{policy.status}</div><p className="card-kicker">{policy.insurer_name ?? "Insurer not found"}</p><h3>{policy.policy_name ?? "Uploaded policy"}</h3><p className="muted">{policy.policy_type ?? "Policy type not found"}</p><div className="policy-details"><div><small>Policy number</small><strong>{policy.policy_number ?? "Not found"}</strong></div><div><small>Status</small><strong>{policy.status}</strong></div></div><div className="policy-card-actions"><Link className="card-action" href={`/policies/${policy.id}`}>Open policy →</Link><DeletePolicyButton policyId={policy.id} /></div></article>)}</section> : <div className="empty-state"><h2>No policies yet</h2><p>Use the upload section on the overview to add your first policy.</p><Link className="outline-button" href="/">Go to overview</Link></div>}</PageFrame>;
}
