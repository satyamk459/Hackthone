"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUploadAcceptAttribute, validatePolicyFile } from "@/lib/upload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type UploadPolicy = { id: string; policy_name: string | null; insurer_name: string | null };

type UploadDocumentProps = { policies?: UploadPolicy[]; onboarding?: boolean };

export function UploadDocument({ policies = [], onboarding = false }: UploadDocumentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploadError, setUploadError] = useState("");
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "extracting" | "ready">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [isDropActive, setIsDropActive] = useState(false);

  async function acceptFiles(files: File[]) {
    if (!files.length) return;
    const invalidFile = files.map(validatePolicyFile).find(Boolean);
    if (invalidFile) { setUploadError(invalidFile); return; }
    setUploadError("");
    setUploadStage("uploading");
    setUploadProgress(0);
    let policyId = selectedPolicyId;
    let latestResult: { policyId: string } | null = null;
    for (const [index, file] of files.entries()) {
      const extension = file.name.toLowerCase().split(".").pop();
      const mimeType = file.type || (extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
      const prepareResponse = await fetch("/api/policies/upload/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size, policyId }) });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(prepared.error ?? "We could not prepare this document.");
      policyId = prepared.policyId;
      const storageUpload = await createSupabaseBrowserClient().storage.from("insurance-documents").upload(prepared.storagePath, file, { contentType: mimeType, upsert: false });
      if (storageUpload.error) throw new Error(storageUpload.error.message || "We could not store this document securely.");
      const completeResponse = await fetch("/api/policies/upload/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prepared) });
      const result = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(result.error ?? "We could not register this document.");
      latestResult = result;
      setUploadProgress(Math.round(((index + 1) / files.length) * 70));
    }
    if (!latestResult) throw new Error("No documents were uploaded.");
    setUploadStage("extracting");
    setUploadProgress(85);
    const processResponse = await fetch(`/api/policies/${latestResult.policyId}/process`, { method: "POST" });
    const processResult = await processResponse.json();
    if (!processResponse.ok) throw new Error(processResult.error ?? "Analysis could not be completed. Please try again.");
    setUploadStage("ready");
    setUploadProgress(100);
    router.push("/overview");
  }

  function handleFiles(files: File[]) {
    acceptFiles(files).catch((error) => {
      setUploadStage("idle");
      setUploadError(error instanceof Error ? error.message : "This upload could not be completed.");
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropActive(false);
    handleFiles(Array.from(event.dataTransfer.files));
  }

  return <main className={`onboarding-page ${onboarding ? "is-onboarding" : ""}`}><div className="onboarding-brand"><span className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></span><span className="onboarding-step">{onboarding ? "STEP 1 OF 2 &middot; SET UP YOUR COVER" : "DOCUMENT WORKSPACE"}</span></div><section className="onboarding-copy"><p className="landing-kicker">{onboarding ? "WELCOME TO CLAIMWISE" : "UPLOAD DOCUMENT"}</p><h1>{onboarding ? <>Start with your<br /><em>documents.</em></> : <>Add documents to<br /><em>your policy.</em></>}</h1><p>{onboarding ? "Upload your policy and any supporting files. We will identify the insurance type, explain the cover, and prepare your claim checklist." : "Upload one or more policy or claim documents. ClaimWise will analyze them together and update your overview."}</p></section><div className={`upload-dropzone onboarding-dropzone ${isDropActive ? "drop-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }} onDragLeave={() => setIsDropActive(false)} onDrop={handleDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}><span className="upload-drop-icon">^</span><strong>Drop your documents here</strong><span>Policy PDF, JPG, PNG, or DOCX &middot; up to 30 MB each &middot; multiple files supported</span>{policies.length > 0 && <select aria-label="Add documents to an existing policy" value={selectedPolicyId} onChange={(event) => { event.stopPropagation(); setSelectedPolicyId(event.target.value); }} onClick={(event) => event.stopPropagation()}><option value="">Create a new policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>Add to {policy.policy_name ?? policy.insurer_name ?? "existing policy"}</option>)}</select>}{uploadStage !== "idle" && <div className="upload-progress" aria-live="polite"><div className="upload-progress-label"><span>{uploadStage === "uploading" ? "Uploading..." : uploadStage === "extracting" ? "Extracting text..." : "Ready OK"}</span><span>{uploadProgress}%</span></div><div className="upload-progress-track"><span style={{ width: `${uploadProgress}%` }} /></div></div>}</div><input ref={inputRef} type="file" accept={getUploadAcceptAttribute()} multiple onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(Array.from(event.target.files ?? []))} hidden />{uploadError && <p className="onboarding-error" role="alert">{uploadError}</p>}<p className="onboarding-note">Your documents are private and protected by Supabase authentication.</p></main>;
}
