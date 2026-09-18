"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DeletePolicyButton } from "@/components/DeletePolicyButton";

type Policy = { id: string; insurer_name: string | null; policy_name: string | null; policy_number: string | null; policy_type: string | null; status: string; policy_documents?: { file_name: string; processing_status: string }[] };

function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return <main className="landing-page"><header className="landing-nav"><Link className="landing-brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav aria-label="Landing page navigation"><a href="#how-it-works">How it works</a><a href="#security">Security</a><a href="#support">Support</a></nav><button className="landing-login" onClick={onSignIn}>Log in</button><button className="landing-cta" onClick={onSignIn}>File a claim</button></header><section className="landing-hero"><div className="landing-copy"><p className="landing-kicker">CLAIMWISE AI Â· INSURANCE, MADE LEGIBLE</p><h1>A simpler way<br />to understand claims.</h1><p>Upload your policy and supporting documents. ClaimWise AI turns complex insurance language into clear coverage, claim requirements, and next steps.</p><div className="landing-actions"><button className="landing-cta" onClick={onSignIn}>File a claim <span>â†’</span></button><a href="#how-it-works">See how it works <span>â†’</span></a></div><div className="landing-trust" id="security"><div><span>ÏŸ</span><strong>Fast processing</strong><small>Updates as your documents are analyzed</small></div><div><span>â—‡</span><strong>Private by design</strong><small>Your files stay in your Supabase account</small></div><div><span>â™™</span><strong>Clear guidance</strong><small>Know what to do next, without the jargon</small></div></div></div><div className="landing-art" aria-label="Illustration of a protected insurance claim"><div className="art-sun" /><div className="art-city"><i /><i /><i /><i /><i /></div><div className="art-house"><span /><b /><em /></div><div className="art-person"><span /><b /><i /></div><div className="art-sheet"><strong>CLAIM</strong><span>âœ“</span><span>âœ“</span><span>âœ“</span></div><div className="art-shield">âœ“</div></div></section><section className="landing-bottom" id="how-it-works"><span>01</span><strong>Upload your documents</strong><span>02</span><strong>Understand your cover</strong><span>03</span><strong>Move forward with confidence</strong></section></main>;
}

export default function Home() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [userName, setUserName] = useState("Your account");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("U");
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthReady(true); return; }
      setAuthenticated(true);
      const name = data.user.user_metadata.full_name ?? data.user.user_metadata.name ?? data.user.email?.split("@")[0] ?? "Your account";
      setUserName(name);
      setUserEmail(data.user.email ?? "");
      setUserInitials(name.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase());
      const response = await fetch("/api/policies/upload");
      if (response.ok) setPolicies((await response.json()).policies ?? []);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (authReady && authenticated && policies.length === 0) router.replace("/upload");
  }, [authReady, authenticated, policies.length, router]);

  if (!authReady) return <main className="landing-page landing-loading"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div></main>;
  if (!authenticated) return <LandingPage onSignIn={() => router.push("/login")} />;
  if (!policies.length) return <main className="landing-page landing-loading"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div></main>;

  return <div className="app-shell" suppressHydrationWarning><main className="main-content"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav" aria-label="Main navigation"><Link className="top-nav-link active" href="/">â–¦ Overview</Link><Link className="top-nav-link" href="/policies">â–± My policies <b>{policies.length}</b></Link><Link className="top-nav-link" href="/activity">âŒ Activity</Link><Link className="top-nav-link" href="/settings">âš™ Settings</Link></nav><div className="user-chip top-user"><span className="avatar">{userInitials}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></div></header><div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">YOUR CLAIMWISE OVERVIEW</p><h1>Make sense of your cover.</h1><p className="intro">Your policies, decoded into clear answers you can act on.</p></div></section><section className="policy-grid overview-policy-grid">{policies.map((policy, index) => <article className="policy-card" key={policy.id}><div className={`policy-logo ${index % 2 === 0 ? "orange" : "blue"}`}>{(policy.insurer_name ?? "P").slice(0, 2)}</div><div className="policy-status"><span className={`status-dot ${policy.status === "completed" ? "done" : "processing"}`}></span>{policy.status}</div><p className="card-kicker">{policy.insurer_name ?? "Insurer not found"}</p><h3>{policy.policy_name ?? "Uploaded policy"}</h3><p className="muted">{policy.policy_type ?? "Policy type not found"}</p><div className="policy-details"><div><small>Policy number</small><strong>{policy.policy_number ?? "Not found"}</strong></div><div><small>Documents</small><strong>{policy.policy_documents?.length ?? 0}</strong></div></div><div className="policy-card-actions"><Link className="card-action" href={`/policies/${policy.id}/analysis`}>Open analysis â†’</Link><DeletePolicyButton policyId={policy.id} /></div></article>)}</section><section className="overview-links"><Link className="panel overview-link" href={`/policies/${policies[0].id}/analysis`}><p className="eyebrow">AI ANALYSIS</p><h2>Review your cover <span>â†’</span></h2><p>Insurance type, coverage, claim requirements, missing documents, and next steps.</p></Link><Link className="panel overview-link" href="/upload"><p className="eyebrow">DOCUMENT WORKSPACE</p><h2>Add more documents <span>â†’</span></h2><p>Add supporting files to an existing policy or start a new policy workspace.</p></Link></section></div></main></div>;
}
