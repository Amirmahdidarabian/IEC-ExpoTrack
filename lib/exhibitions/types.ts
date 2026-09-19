export type Source = {
  id: string;
  label: string;
  url: string;
  lastChecked: string;
  priority: number;
};

export type TaxonomyItem = {
  id: string;
  name: string;
  slug: string;
  usageCount?: number;
};

export type UserReference = { id: string; username: string };

export type Exhibition = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  industry: string;
  eventType: string;
  country: string;
  countryCode: string;
  city: string;
  venue: string;
  address: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  organizer: string;
  website: string;
  description: string;
  aiReport: string;
  topics: string[];
  categories: TaxonomyItem[];
  topicItems: TaxonomyItem[];
  saved: boolean;
  preEventEmailSent?: boolean;
  preEventEmailSentAt?: string | null;
  preEventEmailSentBy?: UserReference | null;
  postEventEmailSent?: boolean;
  postEventEmailSentAt?: string | null;
  postEventEmailSentBy?: UserReference | null;
  createdBy?: UserReference | null;
  updatedBy?: UserReference | null;
  createdAt: string;
  updatedAt: string;
  sources: Source[];
};

export type ExhibitionInput = Omit<Exhibition, "id" | "slug" | "saved" | "createdAt" | "updatedAt" | "sources" | "categories" | "topicItems"> & {
  slug?: string;
  categoryIds: string[];
  topicIds: string[];
  sources?: Omit<Source, "id">[];
};

export type SortKey = "nearest" | "latest" | "name" | "country" | "recent";
export type StatusKey = "all" | "upcoming" | "ongoing" | "past";

export type ExhibitionFilters = {
  q?: string;
  country?: string;
  industry?: string;
  year?: string;
  topic?: string;
  status?: StatusKey;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
};

export type ExhibitionListResult = {
  items: Exhibition[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: { total: number; countries: number; industries: number };
  options: { countries: string[]; industries: string[]; years: string[] };
};
