"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Policy = { id: string };

function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return <main className="landing-page"><header className="landing-nav"><Link className="landing-brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav aria-label="Landing page navigation"><a href="#how-it-works">How it works</a><a href="#security">Security</a><a href="#support">Support</a></nav><button className="landing-login" onClick={onSignIn}>Log in</button><button className="landing-cta" onClick={onSignIn}>File a claim</button></header><section className="landing-hero"><div className="landing-copy"><p className="landing-kicker">CLAIMWISE AI Â· INSURANCE, MADE LEGIBLE</p><h1>A simpler way<br />to understand claims.</h1><p>Upload your policy and supporting documents. ClaimWise AI turns complex insurance language into clear coverage, claim requirements, and next steps.</p><div className="landing-actions"><button className="landing-cta" onClick={onSignIn}>File a claim <span>â†’</span></button><a href="#how-it-works">See how it works <span>â†’</span></a></div><div className="landing-trust" id="security"><div><span>ÏŸ</span><strong>Fast processing</strong><small>Updates as your documents are analyzed</small></div><div><span>â—‡</span><strong>Private by design</strong><small>Your files stay in your Supabase account</small></div><div><span>â™™</span><strong>Clear guidance</strong><small>Know what to do next, without the jargon</small></div></div></div><div className="landing-art" aria-label="Illustration of a protected insurance claim"><div className="art-sun" /><div className="art-city"><i /><i /><i /><i /><i /></div><div className="art-house"><span /><b /><em /></div><div className="art-person"><span /><b /><i /></div><div className="art-sheet"><strong>CLAIM</strong><span>âœ“</span><span>âœ“</span><span>âœ“</span></div><div className="art-shield">âœ“</div></div></section><section className="landing-bottom" id="how-it-works"><span>01</span><strong>Upload your documents</strong><span>02</span><strong>Understand your cover</strong><span>03</span><strong>Move forward with confidence</strong></section></main>;
}

export default function Home() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) { setReady(true); return; }
      setAuthenticated(true);
      const response = await fetch("/api/policies/upload");
      const result = response.ok ? await response.json() : { policies: [] as Policy[] };
      router.replace(result.policies?.length ? "/overview" : "/upload");
    });
  }, [router]);
  if (!ready || authenticated) return <main className="landing-page landing-loading"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div></main>;
  return <LandingPage onSignIn={() => router.push("/login")} />;
}
