import { PrismaClient } from "@prisma/client";
import { seedExhibitions } from "../lib/exhibitions/seed-data";

const prisma = new PrismaClient();

async function main() {
  for (const item of seedExhibitions) {
    await prisma.exhibition.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
        slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
        country: item.country, city: item.city, venue: item.venue, address: item.address,
        startDate: new Date(item.startDate), endDate: item.endDate ? new Date(item.endDate) : null,
        timezone: item.timezone, organizer: item.organizer, website: item.website, description: item.description,
        aiReport: item.aiReport, topics: item.topics, saved: item.saved, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
        sources: { create: item.sources.map((source) => ({ label: source.label, url: source.url, priority: source.priority, lastChecked: new Date(source.lastChecked) })) },
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
