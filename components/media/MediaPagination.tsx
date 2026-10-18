"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { mediaPageNumbers, mediaPageSizes } from "@/lib/media/pagination";
import type { MediaList } from "@/lib/media/types";

export function MediaPagination({ result, pending, onPage, onSize }: { result: MediaList; pending: boolean; onPage: (page: number) => void; onSize: (size: string) => void }) {
  const first = result.total ? result.pageSize === "all" ? 1 : (result.page - 1) * result.pageSize + 1 : 0;
  const last = result.pageSize === "all" ? result.total : Math.min(result.page * result.pageSize, result.total);
  return <footer className="media-pagination">
    <span className="media-pagination-summary">Showing <strong>{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong>{result.total.toLocaleString()}</strong></span>
    <nav aria-label="Media pagination">{result.pageSize === "all" ? <span className="media-all-results">All results on one page</span> : <>
      <button className="media-page-button" aria-label="Previous page" disabled={pending || result.page <= 1} onClick={() => onPage(result.page - 1)}><ChevronLeft /></button>
      {mediaPageNumbers(result.page, result.pageCount).map((page, index) => page === "ellipsis" ? <span className="media-page-gap" key={`gap-${index}`}>…</span> : <button key={page} className={`media-page-button ${Math.abs(page-result.page)>1?"is-distant":""}`} aria-label={`Page ${page}`} aria-current={page === result.page ? "page" : undefined} disabled={pending} onClick={() => onPage(page)}>{page}</button>)}
      <button className="media-page-button" aria-label="Next page" disabled={pending || result.page >= result.pageCount} onClick={() => onPage(result.page + 1)}><ChevronRight /></button>
    </>}</nav>
    <label className="media-page-size">Rows per page<select aria-label="Rows per page" value={result.pageSize} disabled={pending} onChange={event => onSize(event.target.value)}>{mediaPageSizes.map(size => <option key={size} value={size}>{size === "all" ? "All" : size}</option>)}</select></label>
  </footer>;
}
