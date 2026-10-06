export type PriorityLevel = "TOP" | "HIGH" | "MEDIUM" | "LOW" | "UNREVIEWED";

export function priorityLevel(score: number | null | undefined): PriorityLevel {
  if (score == null) return "UNREVIEWED";
  if (score >= 90) return "TOP";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function priorityRange(level: string) {
  if (level === "TOP") return { gte: 90, lte: 100 };
  if (level === "HIGH") return { gte: 75, lte: 89 };
  if (level === "MEDIUM") return { gte: 50, lte: 74 };
  if (level === "LOW") return { gte: 0, lte: 49 };
  return undefined;
}

