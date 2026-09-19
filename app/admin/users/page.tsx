import { Permission } from "@prisma/client";
import { AdminNav } from "@/components/AdminNav";
import { Header } from "@/components/Header";
import { UserManagement } from "@/components/UserManagement";
import { requirePageUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/users/service";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePageUser(Permission.MANAGE_USERS); const users = await listUsers();
  const safe = users.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), lastLoginAt: item.lastLoginAt?.toISOString() ?? null, permissions: item.permissions.map((entry) => entry.permission) }));
  return <main className="app-page"><Header user={user} /><section className="simple-hero admin-hero"><p className="eyebrow">Administration</p><h1>User Management</h1><p>Create accounts, control access and preserve lifecycle history.</p><AdminNav /></section><div className="page-container admin-content"><UserManagement initialUsers={safe} currentUserId={user.id} /></div></main>;
}
