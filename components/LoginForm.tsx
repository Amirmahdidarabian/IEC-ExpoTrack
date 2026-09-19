"use client";

import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sign in failed.");
      const next = payload.mustChangePassword ? "/settings/account?required=1" : params.get("next") || "/exhibitions";
      router.replace(next); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed."); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit}><label>Username<input name="username" autoComplete="username" required minLength={3} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Signing in…" : <><LogIn /> Sign In</>}</button></form>;
}
