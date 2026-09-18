import Link from "next/link";
import type { ReactNode } from "react";

export function PageFrame({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <main className="main-content" suppressHydrationWarning>
      <header className="topbar"><Link className="brand" href="/overview"><span className="brand-mark">C</span><span>claimwise</span></Link><nav className="top-nav" aria-label="Main navigation"><Link className="top-nav-link" href="/overview">▦ Overview</Link><Link className="top-nav-link" href="/policies">▱ My policies</Link><Link className="top-nav-link" href="/activity">⌁ Activity</Link><Link className="top-nav-link" href="/settings">⚙ Settings</Link></nav><Link className="help-button" href="/login">Account ↗</Link></header>
      <div className="content-wrap page-content"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1>{children}</div>
    </main>
  );
}
