import Link from "next/link";
import { PageFrame } from "@/components/PageFrame";

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isOptima = id === "optima-secure";
  const name = isOptima ? "Optima Secure" : "Jeevan Umang";
  return <PageFrame eyebrow="POLICY WORKSPACE" title={name}><div className="policy-workspace-header"><div><p className="intro">{isOptima ? "HDFC ERGO · Health insurance" : "LIC · Life insurance"}</p><span className="verified"><span>✓</span> {isOptima ? "Analysed" : "Processing"}</span></div><Link className="outline-button" href="/policies">← All policies</Link></div><div className="workspace-nav"><Link className="selected" href={`/policies/${id}`}>Overview</Link><Link href={`/policies/${id}/analysis`}>Analysis</Link><Link href={`/policies/${id}/chat`}>Ask ClaimWise</Link><Link href="/activity">History</Link></div><section className="policy-summary-grid"><div className="panel"><p className="eyebrow">POLICY DETAILS</p><h2>{isOptima ? "Family floater" : "Life insurance"}</h2><p className="muted">Policy number · •••• 4821</p><div className="policy-details"><div><small>Valid from</small><strong>01 Jan 2026</strong></div><div><small>Valid until</small><strong>31 Dec 2026</strong></div></div></div><Link className="panel overview-link" href={`/policies/${id}/analysis`}><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>View analysis ↗</h2><p>See extracted coverage, limits, and evidence.</p></Link><Link className="panel overview-link" href={`/policies/${id}/chat`}><p className="eyebrow">POLICY Q&amp;A</p><h2>Ask ClaimWise →</h2><p>Ask questions and get answers with policy sources.</p></Link></section></PageFrame>;
}
