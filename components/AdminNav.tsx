import Link from "next/link";
import { Permission } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

export async function AdminNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const allows = (permission: Permission) => user.role === "ADMIN" || user.permissions.includes(permission);
  return <nav className="admin-nav" aria-label="Administration">{allows(Permission.VIEW_ADMIN_DASHBOARD) && <Link href="/admin">Dashboard</Link>}{allows(Permission.MANAGE_USERS) && <Link href="/admin/users">Users</Link>}{allows(Permission.VIEW_AUDIT_LOGS) && <Link href="/admin/activity">Activity Logs</Link>}</nav>;
}
