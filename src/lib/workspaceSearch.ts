import type { WorkspaceFile } from "../api/types";

export type SearchStatus = "pending" | "ready" | "partial" | "unsupported" | "failed";
export interface ExtractedText { text: string; status: Exclude<SearchStatus, "pending"> }
export const MAX_SEARCH_TEXT = 200_000;

export function currentFileText(file: WorkspaceFile): string {
  return file.versions.find((v) => v.current)?.searchText ?? "";
}
export function matchesWorkspaceSearch(file: WorkspaceFile, query: string): boolean {
  const current = file.versions.find((v) => v.current);
  return [file.name, current?.originalName, currentFileText(file), ...file.tags, file.uploader,
    ...file.versions.map((v) => v.note), ...file.comments.flatMap((c) => [c.author, c.text])]
    .some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
}
export function matchRanges(text: string, query: string): { start: number; end: number }[] {
  const term = query.trim();
  if (!term) return [];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(text.matchAll(new RegExp(escaped, "gi")), (match) => ({ start: match.index!, end: match.index! + match[0].length }));
}
export function contentSnippet(text: string, query: string): string {
  const first = matchRanges(text, query)[0];
  if (!first) return "";
  const start = Math.max(0, first.start - 55), end = Math.min(text.length, first.end + 85);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
