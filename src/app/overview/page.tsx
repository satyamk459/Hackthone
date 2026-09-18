"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DeletePolicyButton } from "@/components/DeletePolicyButton";

type Policy = { id: string; insurer_name: string | null; policy_name: string | null; policy_number: string | null; policy_type: string | null; status: string; policy_documents?: { file_name: string; processing_status: string }[] };

export default function OverviewPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [userName, setUserName] = useState("Your account");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("U");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      const name = data.user.user_metadata.full_name ?? data.user.user_metadata.name ?? data.user.email?.split("@")[0] ?? "Your account";
      setUserName(name);
      setUserEmail(data.user.email ?? "");
      setUserInitials(name.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase());
      const response = await fetch("/api/policies/upload");
      const result = response.ok ? await response.json() : { policies: [] };
      const loadedPolicies = result.policies ?? [];
      if (!loadedPolicies.length) { router.replace("/upload"); return; }
      setPolicies(loadedPolicies);
      setReady(true);
    });
  }, [router]);

  if (!ready) return <main className="landing-page landing-loading"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div></main>;
  return <div className="app-shell" suppressHydrationWarning><main className="main-content"><header className="topbar"><Link className="brand" href="/overview"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav" aria-label="Main navigation"><Link className="top-nav-link active" href="/overview"> Overview</Link><Link className="top-nav-link" href="/policies"> My policies <b>{policies.length}</b></Link><Link className="top-nav-link" href="/activity"> Activity</Link><Link className="top-nav-link" href="/settings"> Settings</Link></nav><div className="user-chip top-user"><span className="avatar">{userInitials}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></div></header><div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">YOUR CLAIMWISE OVERVIEW</p><h1>Make sense of your cover.</h1><p className="intro">Your policies, decoded into clear answers you can act on.</p></div></section><section className="policy-grid overview-policy-grid">{policies.map((policy, index) => <article className="policy-card" key={policy.id}><div className={`policy-logo ${index % 2 === 0 ? "orange" : "blue"}`}>{(policy.insurer_name ?? "P").slice(0, 2)}</div><div className="policy-status"><span className={`status-dot ${policy.status === "completed" ? "done" : "processing"}`}></span>{policy.status}</div><p className="card-kicker">{policy.insurer_name ?? "Insurer not found"}</p><h3>{policy.policy_name ?? "Uploaded policy"}</h3><p className="muted">{policy.policy_type ?? "Policy type not found"}</p><div className="policy-details"><div><small>Policy number</small><strong>{policy.policy_number ?? "Not found"}</strong></div><div><small>Documents</small><strong>{policy.policy_documents?.length ?? 0}</strong></div></div><div className="policy-card-actions"><Link className="card-action" href={`/policies/${policy.id}/analysis`}>Open analysis &rarr;</Link><DeletePolicyButton policyId={policy.id} /></div></article>)}</section><section className="overview-links"><Link className="panel overview-link" href={`/policies/${policies[0].id}/analysis`}><p className="eyebrow">AI ANALYSIS</p><h2>Review your cover <span>&rarr;</span></h2><p>Insurance type, coverage, claim requirements, missing documents, and next steps.</p></Link><Link className="panel overview-link" href="/upload"><p className="eyebrow">DOCUMENT WORKSPACE</p><h2>Upload Document <span>&rarr;</span></h2><p>Add more documents to an existing policy or start a new policy workspace.</p></Link></section></div></main></div>;
}
