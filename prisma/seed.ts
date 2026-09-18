import { PrismaClient } from "@prisma/client";
import { seedExhibitions } from "../lib/exhibitions/seed-data";

const prisma = new PrismaClient();

async function main() {
  for (const item of seedExhibitions) {
    const categories = await Promise.all(item.categories.map((category) => prisma.industryCategory.upsert({
      where: { normalizedName: category.name.trim().toLowerCase() },
      update: { name: category.name },
      create: { id: category.id, name: category.name, normalizedName: category.name.trim().toLowerCase(), slug: category.slug },
    })));
    const topics = await Promise.all(item.topicItems.map((topic) => prisma.topic.upsert({
      where: { normalizedName: topic.name.trim().toLowerCase() },
      update: { name: topic.name },
      create: { id: topic.id, name: topic.name, normalizedName: topic.name.trim().toLowerCase(), slug: topic.slug },
    })));
    await prisma.exhibition.upsert({
      where: { slug: item.slug },
      update: {
        countryCode: item.countryCode, industry: categories.map((entry) => entry.name).join(", "), topics: topics.map((entry) => entry.name),
        categories: { deleteMany: {}, create: categories.map((category) => ({ categoryId: category.id })) },
        topicLinks: { deleteMany: {}, create: topics.map((topic) => ({ topicId: topic.id })) },
      },
      create: {
        slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
        country: item.country, countryCode: item.countryCode, city: item.city, venue: item.venue, address: item.address,
        startDate: new Date(item.startDate), endDate: item.endDate ? new Date(item.endDate) : null,
        timezone: item.timezone, organizer: item.organizer, website: item.website, description: item.description,
        aiReport: item.aiReport, topics: item.topics, saved: item.saved, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
        sources: { create: item.sources.map((source) => ({ label: source.label, url: source.url, priority: source.priority, lastChecked: new Date(source.lastChecked) })) },
        categories: { create: categories.map((category) => ({ categoryId: category.id })) },
        topicLinks: { create: topics.map((topic) => ({ topicId: topic.id })) },
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
