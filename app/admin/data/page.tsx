import { AdminNav } from "@/components/AdminNav";
import { DataManagement } from "@/components/DataManagement";
import { Header } from "@/components/Header";
import { requireAdminPageUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DataManagementPage() {
  const user = await requireAdminPageUser();
  return <main className="app-page"><Header user={user} /><section className="simple-hero admin-hero"><p className="eyebrow">Administration</p><h1>Data Management</h1><p>Backup, export and restore IEC exhibition data.</p><AdminNav /></section><div className="page-container admin-content"><DataManagement /></div></main>;
}
