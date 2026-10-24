import { CompanyExhibitionRole, CompanySocialPlatform } from "@prisma/client";
import { z } from "zod";
import { normalizeDomain } from "./normalization";

const emptyToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(5000).nullable().optional());
const optionalShort = z.preprocess(emptyToNull, z.string().trim().max(240).nullable().optional());
const optionalUrl = z.preprocess(emptyToNull, z.string().trim().url().max(2048).nullable().optional());
const optionalEmail = z.preprocess(emptyToNull, z.string().trim().email().max(320).nullable().optional());
const optionalWebsite = z.preprocess(emptyToNull, z.string().trim().max(2048).refine((value) => Boolean(normalizeDomain(value)), "Enter a valid website or domain.").nullable().optional());

export const contactSchema = z.object({
  firstName: optionalShort, lastName: optionalShort, jobTitle: optionalShort, department: optionalShort,
  email: optionalEmail, phone: optionalShort, whatsapp: optionalShort, linkedinUrl: optionalUrl, notes: optionalText,
  isPrimary: z.boolean().default(false),
}).refine((value) => Boolean(value.firstName || value.lastName || value.email || value.phone), { message: "Enter a name, email, or phone number." });

export const companySchema = z.object({
  name: z.string().trim().min(1).max(240), website: optionalWebsite, countryCode: z.preprocess(emptyToNull, z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional()), country: optionalShort,
  description: optionalText, priorityScore: z.number().int().min(0).max(100).nullable().optional(), saved: z.boolean().optional(),
  categoryIds: z.array(z.string().min(1)).max(100).default([]), topicIds: z.array(z.string().min(1)).max(200).default([]),
  folderIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  socialLinks: z.array(z.object({ platform: z.nativeEnum(CompanySocialPlatform), url: z.string().url().max(2048) })).max(20).default([]),
  initialContact: contactSchema.nullable().optional(),
});

export const exhibitionLinkSchema = z.object({
  exhibitionId: z.string().min(1), role: z.nativeEnum(CompanyExhibitionRole).default(CompanyExhibitionRole.UNKNOWN),
  hall: optionalText, booth: optionalText, sourceUrl: optionalUrl, notes: optionalText,
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(10000) });
export const companyPrioritySchema = z.object({ priorityScore: z.number().int().min(0).max(100).nullable() });
export const taxonomyLinksSchema = z.object({ categoryIds: z.array(z.string()).max(100).optional(), topicIds: z.array(z.string()).max(200).optional() });

export type CompanyInput = z.infer<typeof companySchema>;
export type ContactInput = z.infer<typeof contactSchema>;

