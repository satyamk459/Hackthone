"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUploadAcceptAttribute, validatePolicyFile } from "@/lib/upload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DeletePolicyButton } from "@/components/DeletePolicyButton";

type Policy = { id: string; insurer_name: string | null; policy_name: string | null; policy_number: string | null; policy_type: string | null; status: string };

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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

  function beginUpload() {
    if (!authReady || !authenticated) {
      router.push("/login");
      return;
    }
    inputRef.current?.click();
  }

  async function acceptFile(file?: File) {
    if (!file) return;
    const validationError = validatePolicyFile(file);
    setUploadError(validationError ?? "");
    if (validationError) {
      setFileName("");
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop();
    const mimeType = file.type || (extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
    setUploading(true);
    setFileName(file.name);
    const prepareResponse = await fetch("/api/policies/upload/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size }),
    });
    const prepared = await prepareResponse.json();
    if (!prepareResponse.ok) {
      setUploading(false);
      setFileName("");
      setUploadError(prepared.error ?? "We could not prepare this policy upload.");
      return;
    }

    const storageUpload = await createSupabaseBrowserClient().storage
      .from("insurance-documents")
      .upload(prepared.storagePath, file, { contentType: mimeType, upsert: false });
    if (storageUpload.error) {
      setUploading(false);
      setFileName("");
      setUploadError("We could not store this policy document securely.");
      return;
    }

    const response = await fetch("/api/policies/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prepared),
    });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) {
      setFileName("");
      setUploadError(result.error ?? "We could not upload this policy.");
      return;
    }
    setUploading(true);
    setFileName(`Analyzing ${file.name}`);
    const processResponse = await fetch(`/api/policies/${result.policyId}/process`, { method: "POST" });
    const processResult = await processResponse.json();
    setUploading(false);
    if (!processResponse.ok) {
      setUploadError(processResult.error ?? "The PDF was uploaded but could not be analyzed.");
      return;
    }
    setUploadError("");
    setFileName(`Analysis complete: ${file.name}`);
    const policiesResponse = await fetch("/api/policies/upload");
    if (policiesResponse.ok) setPolicies((await policiesResponse.json()).policies ?? []);
    router.push(`/policies/${result.policyId}/analysis`);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
  }

  return (
    <div className="app-shell" suppressHydrationWarning>
      <main className="main-content">
        <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav" aria-label="Main navigation"><Link className="top-nav-link active" href="/">▦ Overview</Link><Link className="top-nav-link" href="/policies">▱ My policies <b>{policies.length}</b></Link><Link className="top-nav-link" href="/activity">⌁ Activity</Link><Link className="top-nav-link" href="/settings">⚙ Settings</Link></nav>{authenticated ? <div className="user-chip top-user"><span className="avatar">{userInitials}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></div> : <Link className="outline-button top-login" href="/login">Sign in</Link>}</header>
        <div className="content-wrap">
          <section className="welcome-row"><div><p className="eyebrow">THURSDAY, 17 SEPTEMBER 2026</p><h1>Make sense of your cover.</h1><p className="intro">Your policies, decoded into clear answers you can act on.</p></div><button className="primary-button" onClick={beginUpload}><span>＋</span> {authenticated ? "Add policy" : "Sign in to add policy"}</button></section>
          <section className="stats-grid" aria-label="Workspace summary">
            <div className="stat-card"><span className="stat-icon orange">▱</span><div><strong>{policies.length}</strong><small>Active policies</small></div><span className="stat-trend">Your account</span></div>
            <div className="stat-card"><span className="stat-icon blue">✦</span><div><strong>86%</strong><small>Documents understood</small></div><span className="stat-trend quiet">Across all policies</span></div>
            <div className="stat-card"><span className="stat-icon green">⌁</span><div><strong>4</strong><small>Questions answered</small></div><span className="stat-trend">View history →</span></div>
          </section>
          <section className="section-heading"><div><p className="eyebrow">YOUR COVER</p><h2>My policies <span>{policies.length}</span></h2></div><Link className="text-button" href="/policies">View all <span>→</span></Link></section>
          <section className="policy-grid">
            {policies.map((policy, index) => <article className="policy-card" key={policy.id}><div className={`policy-logo ${index % 2 === 0 ? "orange" : "blue"}`}>{(policy.insurer_name ?? "P").slice(0, 2)}</div><div className="policy-status"><span className={`status-dot ${policy.status === "completed" ? "done" : "processing"}`}></span>{policy.status}</div><p className="card-kicker">{policy.insurer_name ?? "Insurer not found"}</p><h3>{policy.policy_name ?? "Uploaded policy"}</h3><p className="muted">{policy.policy_type ?? "Policy type not found"}</p><div className="policy-details"><div><small>Policy number</small><strong>{policy.policy_number ?? "Not found"}</strong></div><div><small>Status</small><strong>{policy.status}</strong></div></div><div className="policy-card-actions"><Link className="card-action" href={`/policies/${policy.id}`}>Open policy →</Link><DeletePolicyButton policyId={policy.id} /></div></article>)}
            <button className="add-card" onClick={beginUpload}><span className="add-circle">＋</span><strong>{authenticated ? "Upload another policy" : "Sign in to upload"}</strong><small>PDF, JPG, PNG, or DOCX · 30 MB max</small></button>
          </section>
          <section className="overview-links"><Link className="panel overview-link" href="/policies/optima-secure/analysis"><p className="eyebrow">LATEST ANALYSIS</p><h2>Open policy analysis <span>↗</span></h2><p>Coverage, limits, exclusions, and source references.</p></Link><Link className="panel overview-link" href="/activity"><p className="eyebrow">RECENTLY</p><h2>View activity history <span>→</span></h2><p>Uploads, analysis events, questions, and updates.</p></Link></section>
          <section className="upload-banner"><div className="upload-copy"><span className="upload-icon">↑</span><div><h2>Have another policy?</h2><p>Upload a PDF, JPG, PNG, or DOCX and ClaimWise will turn it into something you can understand.</p></div></div><button className="secondary-button" onClick={beginUpload}>{authenticated ? "Upload document" : "Sign in to upload"} <span>↗</span></button></section>
          <input ref={inputRef} type="file" accept={getUploadAcceptAttribute()} onChange={handleFileChange} hidden />
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
