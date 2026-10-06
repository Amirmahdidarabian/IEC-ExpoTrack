import type { ExhibitionInput } from "./types";

export function blankExhibition(): ExhibitionInput {
  return { name: "", tagline: "", industry: "", categoryIds: [], topicIds: [], eventType: "International Exhibition", country: "", countryCode: "", city: "", venue: "", address: "", startDate: "", endDate: null, timezone: "", organizer: "", website: "", exhibitorListUrl: "", description: "", aiReport: "", topics: [], sources: [] };
}
