import Link from "next/link";
import { PageFrame } from "@/components/PageFrame";
import { SignOutButton } from "@/components/SignOutButton";
import { PasswordForm } from "@/components/PasswordForm";

export default function SettingsPage() {
  return <PageFrame eyebrow="WORKSPACE" title="Settings"><div className="settings-grid"><section className="panel settings-card"><h2>Account</h2><p>Google authentication is connected through Supabase Auth. Set a password to use email login on this same account.</p><PasswordForm /><Link className="outline-button" href="/login">Switch account</Link><SignOutButton /></section><section className="panel settings-card" id="privacy"><h2>Privacy</h2><p>Uploaded policy documents are stored in a private bucket and isolated by user.</p><Link className="outline-button" href="/settings#privacy">Privacy details</Link></section><section className="panel settings-card"><h2>Upload limits</h2><p>PDF, JPG, PNG, and DOCX files up to 30 MB are accepted for processing.</p><Link className="outline-button" href="/overview">Back to overview</Link></section></div></PageFrame>;
}

