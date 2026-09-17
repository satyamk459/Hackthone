"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      setOpen(false);
      setMessage("Password set successfully.");
      setPassword("");
      window.setTimeout(() => setMessage(""), 3500);
    }
    setLoading(false);
  }

  return <div className="password-form"><button className="outline-button" type="button" onClick={() => { setOpen(true); setError(""); }}>Set or change password</button>{message && <p className="success-copy">{message}</p>}{open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setOpen(false); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="password-title"><p className="eyebrow">ACCOUNT SECURITY</p><h2 id="password-title">Set your password</h2><p>Use this password with your Google email on the same ClaimWise account.</p><form className="password-dialog-form" onSubmit={savePassword}><label>Password<input type="password" minLength={6} required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>{error && <p className="auth-error">{error}</p>}<div className="dialog-actions"><button className="cancel-button" type="button" onClick={() => setOpen(false)} disabled={loading}>Cancel</button><button className="confirm-signout-button" type="submit" disabled={loading}>{loading ? "Saving..." : "Save password"}</button></div></form></section></div>}</div>;
}
