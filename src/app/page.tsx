"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUploadAcceptAttribute, validatePolicyFile } from "@/lib/upload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DeletePolicyButton } from "@/components/DeletePolicyButton";

type Policy = { id: string; insurer_name: string | null; policy_name: string | null; policy_number: string | null; policy_type: string | null; status: string; policy_documents?: { file_name: string; processing_status: string }[] };

function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return <main className="landing-page"><header className="landing-nav"><Link className="landing-brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav aria-label="Landing page navigation"><a href="#how-it-works">How it works</a><a href="#security">Security</a><a href="#support">Support</a></nav><button className="landing-login" onClick={onSignIn}>Log in</button><button className="landing-cta" onClick={onSignIn}>File a claim</button></header><section className="landing-hero"><div className="landing-copy"><p className="landing-kicker">CLAIMWISE AI · INSURANCE, MADE LEGIBLE</p><h1>A simpler way<br />to understand claims.</h1><p>Upload your policy and supporting documents. ClaimWise AI turns complex insurance language into clear coverage, claim requirements, and next steps.</p><div className="landing-actions"><button className="landing-cta" onClick={onSignIn}>File a claim <span>→</span></button><a href="#how-it-works">See how it works <span>→</span></a></div><div className="landing-trust" id="security"><div><span>ϟ</span><strong>Fast processing</strong><small>Updates as your documents are analyzed</small></div><div><span>◇</span><strong>Private by design</strong><small>Your files stay in your Supabase account</small></div><div><span>♙</span><strong>Clear guidance</strong><small>Know what to do next, without the jargon</small></div></div></div><div className="landing-art" aria-label="Illustration of a protected insurance claim"><div className="art-sun" /><div className="art-city"><i /><i /><i /><i /><i /></div><div className="art-house"><span /><b /><em /></div><div className="art-person"><span /><b /><i /></div><div className="art-sheet"><strong>CLAIM</strong><span>✓</span><span>✓</span><span>✓</span></div><div className="art-shield">✓</div></div></section><section className="landing-bottom" id="how-it-works"><span>01</span><strong>Upload your documents</strong><span>02</span><strong>Understand your cover</strong><span>03</span><strong>Move forward with confidence</strong></section></main>;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "extracting" | "ready">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [isDropActive, setIsDropActive] = useState(false);
  const [userName, setUserName] = useState("Your account");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("U");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        setAuthReady(true);
        return;
      }
      setAuthenticated(true);
      const name = user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split("@")[0] ?? "Your account";
      setUserName(name);
      setUserEmail(user.email ?? "");
      setUserInitials(name.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase());
      const response = await fetch("/api/policies/upload");
      if (response.ok) setPolicies((await response.json()).policies ?? []);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("upload") === "1" && authenticated) inputRef.current?.click();
  }, [authenticated]);

  if (!authReady) return <main className="landing-page landing-loading"><div className="landing-brand"><span className="brand-mark">C</span><span>claimwise</span></div></main>;
  if (!authenticated) return <LandingPage onSignIn={() => router.push("/login")} />;

  function beginUpload() {
    if (!authReady || !authenticated) {
      router.push("/login");
      return;
    }
    inputRef.current?.click();
  }

  async function acceptFiles(files: File[]) {
    if (!files.length) return;
    const invalidFile = files.map(validatePolicyFile).find(Boolean);
    setUploadError(invalidFile ?? "");
    if (invalidFile) { setFileName(""); return; }

    setUploadStage("uploading");
    setUploadProgress(0);
    setUploading(true);
    setFileName(files.length === 1 ? files[0].name : `${files.length} documents`);
    let policyId = selectedPolicyId;
    let latestResult: { policyId: string } | null = null;
    for (const [index, file] of files.entries()) {
      const fileExtension = file.name.toLowerCase().split(".").pop();
      const mimeType = file.type || (fileExtension === "jpg" || fileExtension === "jpeg" ? "image/jpeg" : fileExtension === "png" ? "image/png" : fileExtension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
      const prepareResponse = await fetch("/api/policies/upload/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size, policyId }) });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(prepared.error ?? "We could not prepare this policy upload.");
      policyId = prepared.policyId;
      const storageUpload = await createSupabaseBrowserClient().storage.from("insurance-documents").upload(prepared.storagePath, file, { contentType: mimeType, upsert: false });
      if (storageUpload.error) throw new Error("We could not store this policy document securely.");
      const response = await fetch("/api/policies/upload/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prepared) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We could not register this policy document.");
      latestResult = result;
      setUploadProgress(Math.round(((index + 1) / files.length) * 70));
    }
    if (!latestResult) throw new Error("No documents were uploaded.");
    setUploadStage("extracting");
    setFileName("Uploaded - analyzing your documents");
    setUploadProgress(85);
    const processResponse = await fetch(`/api/policies/${latestResult.policyId}/process`, { method: "POST" });
    const processResult = await processResponse.json();
    setUploading(false);
    if (!processResponse.ok) {
      setUploadStage("idle");
      setUploadError(processResult.error ?? "Analysis could not be completed. Please try again.");
      return;
    }
    setUploadStage("ready");
    setUploadProgress(100);
    setUploadError("");
    setFileName("Ready - analysis complete");
    const policiesResponse = await fetch("/api/policies/upload");
    if (policiesResponse.ok) setPolicies((await policiesResponse.json()).policies ?? []);
    router.push("/");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? [])).catch((error) => {
      setUploading(false);
      setUploadStage("idle");
      setUploadError(error instanceof Error ? error.message : "This upload could not be completed.");
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropActive(false);
    if (authenticated) acceptFiles(Array.from(event.dataTransfer.files)).catch((error) => {
      setUploading(false);
      setUploadStage("idle");
      setUploadError(error instanceof Error ? error.message : "This upload could not be completed.");
    });
  }

  if (authenticated && policies.length === 0) return <main className="onboarding-page"><div className="onboarding-brand"><Link className="landing-brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><span className="onboarding-step">STEP 1 OF 2 · SET UP YOUR COVER</span></div><section className="onboarding-copy"><p className="landing-kicker">WELCOME TO CLAIMWISE</p><h1>Start with your<br /><em>documents.</em></h1><p>Upload your policy and any supporting files. We will identify the insurance type, explain the cover, and prepare your claim checklist.</p></section><div className={`upload-dropzone onboarding-dropzone ${isDropActive ? "drop-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }} onDragLeave={() => setIsDropActive(false)} onDrop={handleDrop} onClick={beginUpload} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") beginUpload(); }}><span className="upload-drop-icon">↑</span><strong>Drop your documents here</strong><span>Policy PDF, JPG, PNG, or DOCX · up to 30 MB each · multiple files supported</span>{uploadStage !== "idle" && <div className="upload-progress" aria-live="polite"><div className="upload-progress-label"><span>{uploadStage === "uploading" ? "Uploading..." : uploadStage === "extracting" ? "Extracting text..." : "Ready ✓"}</span><span>{uploadProgress}%</span></div><div className="upload-progress-track"><span style={{ width: `${uploadProgress}%` }} /></div></div>}</div><input ref={inputRef} type="file" accept={getUploadAcceptAttribute()} multiple onChange={handleFileChange} hidden />{uploadError && <p className="onboarding-error" role="alert">{uploadError}</p>}<p className="onboarding-note">Your documents are private and protected by Supabase authentication.</p></main>;

  return (
    <div className="app-shell" suppressHydrationWarning>
      <main className="main-content">
        <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav" aria-label="Main navigation"><Link className="top-nav-link active" href="/">▦ Overview</Link><Link className="top-nav-link" href="/policies">▱ My policies <b>{policies.length}</b></Link><Link className="top-nav-link" href="/activity">⌁ Activity</Link><Link className="top-nav-link" href="/settings">⚙ Settings</Link></nav>{authenticated ? <div className="user-chip top-user"><span className="avatar">{userInitials}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></div> : <Link className="outline-button top-login" href="/login">Sign in</Link>}</header>
        <div className="content-wrap">
          <section className="welcome-row"><div><p className="eyebrow">THURSDAY, 17 SEPTEMBER 2026</p><h1>Make sense of your cover.</h1><p className="intro">Your policies, decoded into clear answers you can act on.</p></div></section>
          {authenticated && <div className={`upload-dropzone ${isDropActive ? "drop-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }} onDragLeave={() => setIsDropActive(false)} onDrop={handleDrop} onClick={beginUpload} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") beginUpload(); }}><span className="upload-drop-icon">↑</span><strong>Drop policy or claim documents here</strong><span>PDF or image, max 30 MB each · upload multiple files together</span>{policies.length > 0 && <select aria-label="Add documents to an existing policy" value={selectedPolicyId} onChange={(event) => { event.stopPropagation(); setSelectedPolicyId(event.target.value); }} onClick={(event) => event.stopPropagation()}><option value="">Create a new policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>Add to {policy.policy_name ?? "existing policy"}</option>)}</select>}{uploadStage !== "idle" && <div className="upload-progress" aria-live="polite"><div className="upload-progress-label"><span>{uploadStage === "uploading" ? "Uploading..." : uploadStage === "extracting" ? "Extracting text..." : "Ready ✓"}</span><span>{uploadProgress}%</span></div><div className="upload-progress-track"><span style={{ width: `${uploadProgress}%` }} /></div></div>}</div>}
          <section className="stats-grid" aria-label="Workspace summary">
            <div className="stat-card"><span className="stat-icon orange">▱</span><div><strong>{policies.length}</strong><small>Active policies</small></div><span className="stat-trend">Your account</span></div>
            <div className="stat-card"><span className="stat-icon blue">✦</span><div><strong>86%</strong><small>Documents understood</small></div><span className="stat-trend quiet">Across all policies</span></div>
            <div className="stat-card"><span className="stat-icon green">⌁</span><div><strong>4</strong><small>Questions answered</small></div><span className="stat-trend">View history →</span></div>
          </section>
          <section className="section-heading"><div><p className="eyebrow">YOUR COVER</p><h2>My policies <span>{policies.length}</span></h2></div><Link className="text-button" href="/policies">View all <span>→</span></Link></section>
          <section className="policy-grid">
            {policies.map((policy, index) => <article className="policy-card" key={policy.id}><div className={`policy-logo ${index % 2 === 0 ? "orange" : "blue"}`}>{(policy.insurer_name ?? "P").slice(0, 2)}</div><div className="policy-status"><span className={`status-dot ${policy.status === "completed" ? "done" : "processing"}`}></span>{policy.status}</div><p className="card-kicker">{policy.insurer_name ?? "Insurer not found"}</p><h3>{policy.policy_name ?? "Uploaded policy"}</h3><p className="muted">{policy.policy_type ?? "Policy type not found"}</p><div className="policy-details"><div><small>Policy number</small><strong>{policy.policy_number ?? "Not found"}</strong></div><div><small>Documents</small><strong>{policy.policy_documents?.length ?? 0}</strong></div></div><div className="policy-card-actions"><Link className="card-action" href={`/policies/${policy.id}`}>Open policy →</Link><DeletePolicyButton policyId={policy.id} /></div></article>)}
          </section>
          <section className="overview-links"><Link className="panel overview-link" href="/policies/optima-secure/analysis"><p className="eyebrow">LATEST ANALYSIS</p><h2>Open policy analysis <span>→</span></h2><p>Coverage, limits, exclusions, and source references.</p></Link><Link className="panel overview-link" href="/activity"><p className="eyebrow">RECENTLY</p><h2>View activity history <span>→</span></h2><p>Uploads, analysis events, questions, and updates.</p></Link></section>
          <input ref={inputRef} type="file" accept={getUploadAcceptAttribute()} multiple onChange={handleFileChange} hidden />
          {(fileName || uploadError) && <div className="file-toast"><span>{uploadError ? "!" : uploading ? "…" : "✓"}</span>{uploadError || (uploading ? `Uploading ${fileName}...` : `Uploaded: ${fileName}`)}<button onClick={() => { setFileName(""); setUploadError(""); }}>×</button></div>}
        </div>
      </main>
    </div>
  );
}
/*
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the{" "}
            <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
              page.tsx
            </code>{" "}
            file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert h-[14px] w-4"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={14}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
*/
