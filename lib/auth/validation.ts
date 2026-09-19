import { Permission, UserRole } from "@prisma/client";
import { z } from "zod";

export const usernameSchema = z.string().trim().min(3, "Username must contain at least 3 characters.").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores or hyphens only.");
export const passwordSchema = z.string().min(12, "Password must contain at least 12 characters.").max(128).refine((value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value), "Password must include uppercase, lowercase and a number.");

export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });
export const ownAccountSchema = z.object({
  username: usernameSchema.optional(),
  currentPassword: z.string().min(1),
  newPassword: passwordSchema.optional(),
  confirmPassword: z.string().optional(),
}).superRefine((value, context) => {
  if (value.newPassword && value.newPassword !== value.confirmPassword) context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
});

export const createUserSchema = z.object({
  username: usernameSchema,
  temporaryPassword: passwordSchema,
  role: z.nativeEnum(UserRole).default(UserRole.USER),
  isActive: z.boolean().default(true),
  permissions: z.array(z.nativeEnum(Permission)).default([]),
});

export const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
});

export const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });
