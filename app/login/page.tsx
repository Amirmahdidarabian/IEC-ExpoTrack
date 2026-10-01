import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/settings/account?required=1" : "/");
  return <main className="auth-page"><ThemeToggle className="auth-theme-toggle" /><div className="auth-glow" /><section className="auth-card panel"><Brand /><p className="eyebrow">IEC Exhibition Management</p><h1>Welcome back</h1><p>Sign in to manage International Energy Club exhibition intelligence.</p><Suspense><LoginForm /></Suspense></section></main>;
}
