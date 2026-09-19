import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { Suspense } from "react";

export default function LoginPage() {
  return <main className="auth-page"><div className="auth-glow" /><section className="auth-card panel"><Brand /><p className="eyebrow">IEC Exhibition Management</p><h1>Welcome back</h1><p>Sign in to manage International Energy Club exhibition intelligence.</p><Suspense><LoginForm /></Suspense></section></main>;
}
