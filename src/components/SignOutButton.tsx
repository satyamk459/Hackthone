"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirmSignOut() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return <>
    <button className="signout-button" type="button" onClick={() => setOpen(true)}>Sign Out</button>
    {open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <p className="eyebrow">ACCOUNT</p>
        <h2 id="signout-title">Sign out of ClaimWise?</h2>
        <p>Your saved policies remain private in Supabase and will be available when you sign in again.</p>
        <div className="dialog-actions"><button className="cancel-button" type="button" onClick={() => setOpen(false)} disabled={loading}>Cancel</button><button className="confirm-signout-button" type="button" onClick={confirmSignOut} disabled={loading}>{loading ? "Signing out..." : "Yes, sign out"}</button></div>
      </section>
    </div>}
  </>;
}
