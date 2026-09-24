import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCcw, Search } from "lucide-react";

import { deleteMatch, getMatchesPage } from "../api/matches";
import { MatchCard } from "../components/cards/MatchCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import type { Match, MatchFormat } from "../types/api";

type ResultFilter = "All" | "Decided" | "Undecided";

type PaginationState = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

const PAGE_SIZE_OPTIONS = [6, 12, 24, 48];

export function MatchHistory() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    page_size: 12,
    total_items: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";

  function setSearch(value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("q", value);
      else next.delete("q");
      return next;
    }, { replace: true });
  }
  const [format, setFormat] = useState<MatchFormat | "All">("All");
  const [result, setResult] = useState<ResultFilter>("All");
  const [pageSize, setPageSize] = useState(12);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  const loadMatches = useCallback(async (
    page: number,
    size: number,
    query: string,
    matchFormat: MatchFormat | "All",
    matchResult: ResultFilter,
  ) => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setError(null);
    setLoading(true);

    try {
      const response = await getMatchesPage(page, size, {
        q: query,
        format: matchFormat,
        result: matchResult,
      });
      if (requestId !== latestRequest.current) return;
      setMatches(response.items ?? []);
      setPagination(response.pagination);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err instanceof Error ? err.message : "Failed to load matches");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadMatches(1, pageSize, search, format, result);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [format, loadMatches, pageSize, result, search]);

  async function handleDelete(matchId: number) {
    const confirmed = window.confirm(
      "Delete this match? This will also update stored deck counters.",
    );

    if (!confirmed) return;

    try {
      await deleteMatch(matchId);

      const nextPage =
        matches.length === 1 && pagination.page > 1
          ? pagination.page - 1
          : pagination.page;

      await loadMatches(nextPage, pageSize, search, format, result);
      toast.success("Match deleted and deck records updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
    }
  }

  function goToPage(page: number) {
    if (page < 1 || page > pagination.total_pages) return;
    void loadMatches(page, pageSize, search, format, result);
  }

  const hasFilters = Boolean(
    search.trim() || format !== "All" || result !== "All",
  );

  return (
    <>
      <PageHeader title="Match History" />

      <section className="workspace-panel">

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <label className="relative col-span-2 block min-w-0 sm:col-span-4 xl:col-span-1">
            <span className="sr-only">Search decks or match notes</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks or notes..."
              className="min-h-10 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <select
            aria-label="Filter by match format"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as MatchFormat | "All")
            }
            className="workspace-control w-full min-w-0 border border-white/10 bg-black/30 text-sm font-semibold text-slate-200 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All formats</option>
            <option value="Any">Any</option>
            <option value="Standard">Standard</option>
            <option value="Stride">Stride</option>
          </select>

          <select
            aria-label="Filter by match result"
            value={result}
            onChange={(event) => setResult(event.target.value as ResultFilter)}
            className="workspace-control w-full min-w-0 border border-white/10 bg-black/30 text-sm font-semibold text-slate-200 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All results</option>
            <option value="Decided">Decided</option>
            <option value="Undecided">Undecided</option>
          </select>

          <select
            aria-label="Matches per page"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="workspace-control w-full min-w-0 border border-white/10 bg-black/30 text-sm font-semibold text-slate-200 outline-none focus:border-cyan-300/50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              void loadMatches(pagination.page, pageSize, search, format, result)
            }
            disabled={loading}
            className="workspace-button inline-flex items-center justify-center gap-2 border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-400">
              {hasFilters
                ? `${pagination.total_items} matching battles`
                : `${pagination.total_items} total matches`}
            </span>
            <span aria-hidden="true">·</span>
            <span>{loading ? "Updating results…" : `${matches.length} on this page`}</span>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFormat("All");
                setResult("All");
              }}
              className="rounded-lg px-2 py-1 font-semibold text-cyan-200 transition hover:bg-cyan-300/5 hover:text-cyan-100"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <div className="workspace-inset mt-4 flex items-center gap-2 p-5 text-sm text-slate-400" role="status">
          <RefreshCcw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Loading matches...
        </div>
      ) : matches.length ? (
        <section className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2" aria-label="Match results">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onDelete={handleDelete} />
          ))}
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-6 text-center">
          <p className="text-sm font-bold text-slate-300">No matches found.</p>

        </section>
      )}

      <nav aria-label="Match history pages" className="workspace-inset mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => goToPage(pagination.page - 1)}
          disabled={!pagination.has_prev || loading}
          aria-label="Previous page"
          className="workspace-button inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <div className="text-center text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-300">Page {pagination.page} of {pagination.total_pages}</p>
          <span className="hidden sm:inline">Showing </span>
          <span className="font-bold text-slate-300">
            {pagination.total_items === 0
              ? 0
              : (pagination.page - 1) * pagination.page_size + 1}
          </span>{" "}
          -{" "}
          <span className="font-bold text-slate-300">
            {Math.min(
              pagination.page * pagination.page_size,
              pagination.total_items,
            )}
          </span>{" "}
          of{" "}
          <span className="font-bold text-slate-300">
            {pagination.total_items}
          </span>
        </div>

        <button
          type="button"
          onClick={() => goToPage(pagination.page + 1)}
          disabled={!pagination.has_next || loading}
          aria-label="Next page"
          className="workspace-button inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </>
  );
}
