import type { LinkProps } from "react-router-dom";
import type { WorkspaceStorage } from "./workspaceStorage.ts";

export const MATCH_HISTORY_SEARCH_KEY = "cardfight.match-history.search";
export const HAND_LAB_SOURCE_KEY = "cardfight.hand-lab.source";

export type HandLabSource = { deckId: number; versionId: number };
export type WorkspaceLink = Pick<LinkProps, "to" | "onClick">;

function workspaceLink(
  path: string,
  query: Record<string, string>,
  storage: WorkspaceStorage | null,
  key: string,
  value: unknown,
): WorkspaceLink {
  if (!storage) return { to: `${path}?${new URLSearchParams(query)}` };
  return {
    to: path,
    onClick(event) {
      // Modified clicks open a plain route without changing this tab's selection.
      if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
        storage.write(key, value);
      }
    },
  };
}

export function matchHistoryLink(search: string, storage: WorkspaceStorage | null): WorkspaceLink {
  return workspaceLink("/matches", { q: search }, storage, MATCH_HISTORY_SEARCH_KEY, search);
}

export function handLabLink(source: HandLabSource, storage: WorkspaceStorage | null): WorkspaceLink {
  return workspaceLink("/hand-lab", { deck: String(source.deckId), version: String(source.versionId) }, storage, HAND_LAB_SOURCE_KEY, source);
}

export function cleanWorkspaceSearch(pathname: string, search: string, hosted: boolean): string {
  const keys = ["auth_error"];
  if (hosted) {
    let path = pathname;
    try { path = decodeURI(path); } catch { /* Leave malformed paths to the router. */ }
    path = path.replace(/\/+$/, "").toLowerCase();
    if (path === "/matches") keys.push("q");
    if (path === "/hand-lab") keys.push("deck", "version");
  }
  const params = new URLSearchParams(search);
  if (!keys.some(key => params.has(key))) return search;
  for (const key of keys) params.delete(key);
  return params.size ? `?${params}` : "";
}
