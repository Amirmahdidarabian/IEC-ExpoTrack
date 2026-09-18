import { z } from "zod";

const optionalUrl = z.string().trim().refine((value) => !value || /^https?:\/\//i.test(value), "Enter a valid http(s) URL");
const optionalTimezone = z.string().trim().refine((value) => {
  if (!value) return true;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}, "Enter a valid IANA timezone");

const exhibitionBaseSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  tagline: z.string().trim().default(""),
  industry: z.string().trim().default("Energy"),
  eventType: z.string().trim().default("International Exhibition"),
  country: z.string().trim().min(2, "Country is required"),
  city: z.string().trim().default(""),
  venue: z.string().trim().default(""),
  address: z.string().trim().default(""),
  startDate: z.string().min(1, "Start date is required").refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid start date"),
  endDate: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid end date").nullable().default(null),
  timezone: optionalTimezone.default(""),
  organizer: z.string().trim().default(""),
  website: optionalUrl.default(""),
  description: z.string().trim().default(""),
  aiReport: z.string().trim().default(""),
  topics: z.array(z.string().trim()).default([]),
  sources: z.array(z.object({
    label: z.string().min(1),
    url: z.string().url(),
    lastChecked: z.string(),
    priority: z.number().int().min(1).max(5),
  })).default([]),
});

export const exhibitionSchema = exhibitionBaseSchema.superRefine((value, ctx) => {
  if (value.endDate && new Date(value.endDate) < new Date(value.startDate)) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date" });
  }
});

export const aiExhibitionSchema = exhibitionBaseSchema.partial();

export type ValidExhibitionInput = z.infer<typeof exhibitionSchema>;
