import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Permission } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { UserManagement } from "@/components/UserManagement";
import { permissionLabels } from "@/lib/auth/permissions";

const user = {
  id: "employee-1", username: "Limited employee", role: "USER" as const,
  isActive: true, mustChangePassword: false, createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:00:00.000Z", lastLoginAt: null,
  permissions: [Permission.VIEW_EXHIBITIONS],
};

function permissionFields(permissions: Permission[] = user.permissions, role: "ADMIN" | "USER" = "USER") {
  const html = renderToStaticMarkup(<UserManagement initialUsers={[{ ...user, permissions, role }]} currentUserId="administrator-1" />);
  const fieldsets = html.match(/<fieldset\b[\s\S]*?<\/fieldset>/g) ?? [];
  expect(fieldsets).toHaveLength(2);
  const [create, edit] = fieldsets;
  if (!create || !edit) throw new Error("Both create and edit permission controls must be present");
  return { create, edit };
}

function checkboxFor(fieldset: string, permission: Permission) {
  const label = [...fieldset.matchAll(/<label>([\s\S]*?)<\/label>/g)].find(match => match[1].includes(permissionLabels[permission]))?.[1];
  expect(label, `Visible control for ${permission}`).toBeDefined();
  expect(label).toContain('type="checkbox"');
  return label!;
}

describe("user permission management", () => {
  it("offers every supported permission when creating and editing employees, including Companies and Media", () => {
    const { create, edit } = permissionFields();
    for (const permission of Object.values(Permission)) {
      expect(checkboxFor(create, permission)).toContain(`value="${permission}"`);
      checkboxFor(edit, permission);
    }
  });

  it("leaves Media and Companies access unchecked for an exhibition-only employee", () => {
    const { create, edit } = permissionFields();
    for (const fieldset of [create, edit]) {
      expect(checkboxFor(fieldset, Permission.VIEW_EXHIBITIONS)).toContain('checked=""');
      for (const permission of [Permission.VIEW_MEDIA, Permission.UPDATE_MEDIA, Permission.DELETE_MEDIA, Permission.VIEW_COMPANIES, Permission.MANAGE_USERS]) {
        expect(checkboxFor(fieldset, permission)).not.toContain('checked=""');
      }
    }
  });

  it("shows granted read access independently from Media editing, deletion and import", () => {
    const { edit } = permissionFields([Permission.VIEW_EXHIBITIONS, Permission.VIEW_MEDIA, Permission.VIEW_COMPANIES]);
    expect(checkboxFor(edit, Permission.VIEW_MEDIA)).toContain('checked=""');
    expect(checkboxFor(edit, Permission.VIEW_COMPANIES)).toContain('checked=""');
    for (const permission of [Permission.CREATE_MEDIA, Permission.UPDATE_MEDIA, Permission.DELETE_MEDIA, Permission.IMPORT_MEDIA]) {
      expect(checkboxFor(edit, permission)).not.toContain('checked=""');
    }
  });

  it("shows administrators with all permissions and disables individual permission editing", () => {
    const { edit } = permissionFields([], "ADMIN");
    expect(edit).toContain('disabled=""');
    for (const permission of Object.values(Permission)) expect(checkboxFor(edit, permission)).toContain('checked=""');
  });
});
