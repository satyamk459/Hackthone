"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const router = useRouter();

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  async function submitEmailAuth(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session) setError("Check your email to confirm your account before signing in.");
    else router.push("/");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">C</span><span>claimwise</span></div>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Understand your cover.</h1>
        <p className="auth-copy">Sign in to keep your policies, answers, and document history together.</p>
        <button className="google-button" onClick={signInWithGoogle} disabled={loading}>
          <span className="google-g">G</span>{loading ? "Connecting..." : "Continue with Google"}
        </button>
        <div className="auth-divider"><span>or</span></div>
        <form className="email-auth-form" onSubmit={submitEmailAuth}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label><button className="primary-button" type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "signin" ? "Sign in with email" : "Create account"}</button></form>
        <button className="auth-mode-toggle" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
        {error && <p className="auth-error">{error}</p>}
        <p className="auth-note">Your documents stay private to your account.</p>
      </section>
    </main>
  );
}
