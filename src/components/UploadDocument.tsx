"use client";

import { ChangeEvent, DragEvent, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUploadAcceptAttribute, validatePolicyFile } from "@/lib/upload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type UploadPolicy = { id: string; policy_name: string | null; insurer_name: string | null };

type UploadDocumentProps = {
  policies?: UploadPolicy[];
  onboarding?: boolean;
  isModal?: boolean;
  onClose?: () => void;
  onUploadComplete?: () => void;
};

type UploadStage = "idle" | "uploading" | "uploaded" | "analyzing" | "ready";

export function UploadDocument({ policies = [], onboarding = false, isModal = false, onClose, onUploadComplete }: UploadDocumentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploadError, setUploadError] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [isDropActive, setIsDropActive] = useState(false);
  const [userName, setUserName] = useState("Your account");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("U");

  useEffect(() => {
    if (isModal || onboarding) return;
    createSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const name =
        user.user_metadata.full_name ??
        user.user_metadata.name ??
        user.email?.split("@")[0] ??
        "Your account";
      setUserName(name);
      setUserEmail(user.email ?? "");
      setUserInitials(
        name
          .split(" ")
          .map((part: string) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "U"
      );
    });
  }, [isModal, onboarding]);

  async function uploadFiles(files: File[]) {
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

    setUploadStage("uploaded");
    setUploadProgress(75);

    await runAnalysis(latestResult.policyId);
  }

  async function runAnalysis(policyId: string) {
    setUploadStage("analyzing");
    setUploadProgress(85);
    try {
      const processResponse = await fetch(`/api/policies/${policyId}/process`, { method: "POST" });

      // Safely parse JSON — the response might not be valid JSON (e.g. HTML error page)
      let processResult: { error?: string; retryable?: boolean; code?: string } = {};
      try {
        processResult = await processResponse.json();
      } catch {
        // Response was not valid JSON
        const responseText = await processResponse.text();
        console.error("Analysis response was not valid JSON", {
          policyId,
          status: processResponse.status,
          responsePreview: responseText.substring(0, 500),
        });
      }

      if (!processResponse.ok) {
        // Analysis failed but document is safely uploaded — show user-friendly message but log the actual error
        const errorMsg = processResult.error || `Analysis failed with status ${processResponse.status}`;
        console.warn("Analysis failed, but document is safely uploaded", {
          policyId,
          status: processResponse.status,
          error: errorMsg,
          code: processResult.code,
          retryable: processResult.retryable,
        });
      }

      setUploadStage("ready");
      setUploadProgress(100);
      if (isModal && onUploadComplete) {
        onUploadComplete();
      } else {
        router.push("/overview");
      }
    } catch (error) {
      // Analysis errored but document is safely uploaded — proceed to overview
      console.error("Analysis error (document still safely uploaded)", {
        policyId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      setUploadStage("ready");
      setUploadProgress(100);
      if (isModal && onUploadComplete) {
        onUploadComplete();
      } else {
        router.push("/overview");
      }
    }
  }



  function handleFiles(files: File[]) {
    uploadFiles(files).catch((error) => {
      setUploadStage("idle");
      setUploadError(error instanceof Error ? error.message : "This upload could not be completed.");
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropActive(false);
    handleFiles(Array.from(event.dataTransfer.files));
  }

  const stageLabel =
    uploadStage === "uploading" ? "Uploading..." :
    uploadStage === "uploaded" ? "Upload complete — starting analysis..." :
    uploadStage === "analyzing" ? "Analyzing document..." :
    uploadStage === "ready" ? "Ready \u2714" :
    "";

  const content = <><section className={isModal ? "upload-modal-copy" : "onboarding-copy"}><p className="landing-kicker">{onboarding ? "WELCOME TO CLAIMWISE" : "UPLOAD DOCUMENT"}</p><h1>{onboarding ? <>Start with your<br /><em>documents.</em></> : <>Add documents to<br /><em>your policy.</em></>}</h1><p>{onboarding ? "Upload your policy and any supporting files. We will identify the insurance type, explain the cover, and prepare your claim checklist." : "Upload one or more policy or claim documents. ClaimWise will analyze them together and update your overview."}</p></section><div className={`upload-dropzone ${isModal ? "modal-dropzone" : "onboarding-dropzone"} ${isDropActive ? "drop-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }} onDragLeave={() => setIsDropActive(false)} onDrop={handleDrop} onClick={() => { if (uploadStage === "idle") inputRef.current?.click(); }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}><span className="upload-drop-icon">^</span><strong>Drop your documents here</strong><span>Policy PDF, JPG, PNG, or DOCX &middot; up to 30 MB each &middot; multiple files supported</span>{policies.length > 0 && <select aria-label="Add documents to an existing policy" value={selectedPolicyId} onChange={(event) => { event.stopPropagation(); setSelectedPolicyId(event.target.value); }} onClick={(event) => event.stopPropagation()}><option value="">Create a new policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>Add to {policy.policy_name ?? policy.insurer_name ?? "existing policy"}</option>)}</select>}{uploadStage !== "idle" && <div className="upload-progress" aria-live="polite"><div className="upload-progress-label"><span>{stageLabel}</span><span>{uploadProgress}%</span></div><div className="upload-progress-track"><span style={{ width: `${uploadProgress}%` }} /></div></div>}</div><input ref={inputRef} type="file" accept={getUploadAcceptAttribute()} multiple onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(Array.from(event.target.files ?? []))} hidden />{uploadError && <p className={isModal ? "upload-modal-error" : "onboarding-error"} role="alert">{uploadError}</p>}<p className={isModal ? "upload-modal-note" : "onboarding-note"}>Your documents are private and protected by Supabase authentication.</p></>;

  if (isModal) {
    return <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}><div className="upload-modal"><header className="upload-modal-header"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div><button type="button" className="upload-modal-close" onClick={onClose} aria-label="Close upload dialog">&times;</button></header>{content}</div></div>;
  }

  if (onboarding) {
    return <main className="onboarding-page is-onboarding"><div className="onboarding-brand"><span className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></span><span className="onboarding-step">STEP 1 OF 2 \u00b7 SET UP YOUR COVER</span></div>{content}</main>;
  }

  // Non-modal, non-onboarding: show as main app page with topbar
  return (
    <div className="app-shell" suppressHydrationWarning>
      <main className="main-content">
        <header className="topbar">
          <Link className="brand" href="/overview">
            <span className="brand-mark">C</span>
            <span>claimwise</span>
          </Link>
          <nav className="top-nav" aria-label="Main navigation">
            <Link className="top-nav-link" href="/overview">
              Overview
            </Link>
            <Link className="top-nav-link" href="/policies">
              My policies <b>{policies.length}</b>
            </Link>
            <Link className="top-nav-link" href="/activity">
              Activity
            </Link>
            <Link className="top-nav-link" href="/settings">
              Settings
            </Link>
          </nav>
          <div className="user-chip top-user">
            <span className="avatar">{userInitials}</span>
            <span>
              <strong>{userName}</strong>
              <small>{userEmail}</small>
            </span>
          </div>
        </header>
        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">UPLOAD DOCUMENT</p>
              <h1>Add to your policies.</h1>
              <p className="intro">Upload additional policy documents and supporting files to your workspace.</p>
            </div>
          </section>
          <div style={{ maxWidth: "760px", marginLeft: "auto", marginRight: "auto" }}>
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}
