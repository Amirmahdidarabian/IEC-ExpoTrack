import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SavedClient } from "@/components/SavedClient";
import { requirePageUser } from "@/lib/auth/session";
import { Permission } from "@prisma/client";
import { hasPermission } from "@/lib/auth/permissions";

export default async function SavedPage() {
  const user = await requirePageUser();
  return <main className="app-page"><Header user={user} /><section className="simple-hero"><p className="eyebrow">Your shortlist</p><h1>Saved Intelligence</h1><p>Keep the exhibitions and companies that matter most close at hand.</p></section><div className="page-container content-space"><SavedClient canViewExhibitions={hasPermission(user, Permission.VIEW_EXHIBITIONS)} canViewCompanies={hasPermission(user, Permission.VIEW_COMPANIES)} /></div><Footer /></main>;
}
