import { z } from "zod";

export const folderColors = ["cyan", "blue", "violet", "emerald", "amber", "rose"] as const;
export const folderSchema = z.object({
  name: z.string().trim().min(1).max(100).refine((name) => /[\p{L}\p{N}]/u.test(name), "Enter a folder name containing letters or numbers."),
  description: z.string().trim().max(600).default(""),
  color: z.enum(folderColors).default("cyan"),
});
export const membershipSchema = z.object({
  companyIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  folderId: z.string().min(1).max(100),
  action: z.enum(["add", "remove"]),
});
