"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePolicyButton({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function deletePolicy() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/policies/${policyId}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(result?.error ?? "The policy could not be deleted.");
      setLoading(false);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return <>
    <button className="delete-policy-button" type="button" onClick={() => setOpen(true)}>Delete</button>
    {open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setOpen(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-policy-title">
        <p className="eyebrow">DANGER ZONE</p>
        <h2 id="delete-policy-title">Are you sure you want to delete this policy?</h2>
        <p>This removes the policy, uploaded documents, analysis, chat, and history for this policy.</p>
        {error && <p className="delete-error">{error}</p>}
        <div className="dialog-actions"><button className="cancel-button" type="button" onClick={() => setOpen(false)} disabled={loading}>Cancel</button><button className="confirm-signout-button" type="button" onClick={deletePolicy} disabled={loading}>{loading ? "Deleting..." : "Yes, delete policy"}</button></div>
      </section>
    </div>}
  </>;
}
