import { Header } from "@/components/Header";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { requirePageUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requirePageUser(undefined, true); const required = (await searchParams).required === "1" || user.mustChangePassword;
  return <main className="app-page"><Header user={user} /><section className="simple-hero"><p className="eyebrow">My account</p><h1>Account Settings</h1><p>Update your username and secure your IEC ExpoTrack account.</p></section><div className="page-container account-page"><AccountSettingsForm username={user.username} passwordRequired={required} /></div></main>;
}
