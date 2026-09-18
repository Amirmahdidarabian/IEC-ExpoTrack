import { z } from "zod";

const optionalUrl = z.string().trim().refine((value) => !value || /^https?:\/\//i.test(value), "Enter a valid http(s) URL");

export const exhibitionSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  tagline: z.string().trim().default(""),
  industry: z.string().trim().default("Energy"),
  eventType: z.string().trim().default("International Exhibition"),
  country: z.string().trim().min(2, "Country is required"),
  city: z.string().trim().default(""),
  venue: z.string().trim().default(""),
  address: z.string().trim().default(""),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().nullable().default(null),
  timezone: z.string().trim().default("UTC"),
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
}).superRefine((value, ctx) => {
  if (value.endDate && new Date(value.endDate) < new Date(value.startDate)) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date" });
  }
});

export type ValidExhibitionInput = z.infer<typeof exhibitionSchema>;
