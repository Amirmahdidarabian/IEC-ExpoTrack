"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AccountSettingsForm({ username, passwordRequired }: { username: string; passwordRequired: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const data = new FormData(event.currentTarget); const newPassword = String(data.get("newPassword") ?? "");
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), currentPassword: data.get("currentPassword"), newPassword: newPassword || undefined, confirmPassword: data.get("confirmPassword") || undefined }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to update account.");
      setMessage("Account updated successfully."); router.replace("/exhibitions"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update account."); }
    finally { setBusy(false); }
  }
  return <section className="settings-card panel"><h2>{passwordRequired ? "Change your temporary password" : "Account details"}</h2>{passwordRequired && <p className="warning-note">You must set a new password before using the application.</p>}<form className="auth-form" onSubmit={submit}><label>Username<input name="username" defaultValue={username} autoComplete="username" required /></label><label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New Password<input name="newPassword" type="password" autoComplete="new-password" required={passwordRequired} minLength={12} /></label><label>Confirm New Password<input name="confirmPassword" type="password" autoComplete="new-password" required={passwordRequired} minLength={passwordRequired ? 12 : undefined} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-note" role="status">{message}</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save Account Changes"}</button></form></section>;
}
