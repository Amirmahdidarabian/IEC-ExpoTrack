import { Permission, UserRole } from "@prisma/client";

export const ALL_PERMISSIONS = Object.values(Permission);

export type AuthorizedUser = {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  permissions: Permission[];
};

export function hasPermission(user: Pick<AuthorizedUser, "role" | "permissions">, permission: Permission) {
  return user.role === UserRole.ADMIN || user.permissions.includes(permission);
}

export function effectivePermissions(user: Pick<AuthorizedUser, "role" | "permissions">) {
  return user.role === UserRole.ADMIN ? ALL_PERMISSIONS : user.permissions;
}

export const permissionLabels: Record<Permission, string> = {
  VIEW_EXHIBITIONS: "View exhibitions",
  CREATE_EXHIBITIONS: "Create exhibitions",
  UPDATE_EXHIBITIONS: "Update exhibitions and email status",
  DELETE_EXHIBITIONS: "Delete exhibitions",
  VIEW_ADMIN_DASHBOARD: "View administration dashboard",
  MANAGE_USERS: "Manage users",
  VIEW_AUDIT_LOGS: "View activity logs",
};
