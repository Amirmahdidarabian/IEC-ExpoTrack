export const mediaPageSizes = [25, 50, 100, "all"] as const;
export type MediaPageSize = typeof mediaPageSizes[number];

export function mediaPagination(total: number, pageSize: MediaPageSize, requestedPage: number) {
  const pageCount = pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const page = pageSize === "all" ? 1 : Math.min(pageCount, Math.max(1, requestedPage));
  const skip = pageSize === "all" ? 0 : (page - 1) * pageSize;
  return { page, pageCount, skip, take: pageSize === "all" ? undefined : pageSize };
}

export function mediaPageNumbers(page: number, pageCount: number): (number | "ellipsis")[] {
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  return pages.flatMap((value, index) => index && value - pages[index - 1] > 1 ? ["ellipsis" as const, value] : [value]);
}
