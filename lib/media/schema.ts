import { CompanySocialPlatform, MediaContactMethod } from "@prisma/client";
import { z } from "zod";
import { normalizeMediaUrl } from "./normalization";

const blank = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().optional());
const url = z.preprocess(blank, z.string().trim().max(2048).refine((value) => Boolean(normalizeMediaUrl(value)), "Enter a safe HTTP(S) URL.").transform((value) => normalizeMediaUrl(value)!).nullable().optional());
const contactFields = z.object({
  name: text(240), roleLabel: text(500), department: text(240), email: z.preprocess(blank, z.string().trim().email().max(320).transform(v => v.toLowerCase()).nullable().optional()),
  phone: text(120), linkedInUrl: url, contactPageUrl: url, contactMethod: z.nativeEnum(MediaContactMethod).optional(), notes: text(5000), isPrimary: z.boolean().optional(), position: z.number().int().min(0).max(100000).optional(),
});
export const mediaContactSchema = contactFields.refine(v => Boolean(v.name || v.roleLabel || v.department || v.email || v.phone || v.contactPageUrl || v.contactMethod === "WEBSITE_FORM" || v.notes), "Provide a name, role, email, phone or contact method.")
  .refine(v=>v.contactMethod!=="EMAIL"||Boolean(v.email),"Email contact method requires an email. For a role-only contact, select Other.")
  .refine(v=>v.contactMethod!=="CONTACT_PAGE"||Boolean(v.contactPageUrl),"Contact-page method requires a safe contact URL.");
export const mediaContactPatchSchema = contactFields.partial();
const fields = {
  name: z.string().trim().min(1).max(300), websiteUrl: url,
  sourceCategoryRaw: text(1000), countryCode: z.preprocess(blank, z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional()), countryName: text(240), publicationScopeRaw: text(500), description: text(10000),
  categoryIds: z.array(z.string().min(1)).max(100).optional(), topicIds: z.array(z.string().min(1)).max(200).optional(),
  socialLinks: z.array(z.object({ platform: z.nativeEnum(CompanySocialPlatform), url: z.string().max(2048).refine(v => Boolean(normalizeMediaUrl(v)), "Invalid social URL").transform(v => normalizeMediaUrl(v)!) })).max(20).optional(),
};
export const mediaSchema = z.object({ ...fields, initialContact: mediaContactSchema.optional() });
export const mediaPatchSchema = z.object(fields).partial();
export const mediaClassificationSchema = z.object({ categoryIds: z.array(z.string().min(1)).max(100), topicIds: z.array(z.string().min(1)).max(200) });
export const mediaNoteSchema = z.object({ body: z.string().trim().min(1).max(10000) });
export type MediaInput = z.infer<typeof mediaSchema>;
export type MediaContactInput = z.infer<typeof mediaContactSchema>;
