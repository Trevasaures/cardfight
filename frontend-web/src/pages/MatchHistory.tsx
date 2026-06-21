import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search } from "lucide-react";

import { deleteMatch, getMatchesPage } from "../api/matches";
import { MatchCard } from "../components/cards/MatchCard";
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

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<MatchFormat | "All">("All");
  const [result, setResult] = useState<ResultFilter>("All");
  const [pageSize, setPageSize] = useState(12);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMatches(page = pagination.page, size = pageSize) {
    setError(null);
    setLoading(true);

    try {
      const response = await getMatchesPage(page, size);
      setMatches(response.items ?? []);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMatches(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const filteredMatches = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return matches.filter((match) => {
      const matchesSearch =
        !needle ||
        match.deck1_name.toLowerCase().includes(needle) ||
        match.deck2_name.toLowerCase().includes(needle) ||
        (match.winner_name ?? "").toLowerCase().includes(needle) ||
        match.notes.toLowerCase().includes(needle);

      const matchesFormat = format === "All" || match.format === format;

      const matchesResult =
        result === "All" ||
        (result === "Decided" && match.is_decided) ||
        (result === "Undecided" && match.is_undecided);

      return matchesSearch && matchesFormat && matchesResult;
    });
  }, [matches, search, format, result]);

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

      await loadMatches(nextPage, pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
    }
  }

  function goToPage(page: number) {
    if (page < 1 || page > pagination.total_pages) return;
    loadMatches(page, pageSize);
  }

  return (
    <>
      <PageHeader
        eyebrow="Match History"
        title="Logged battles"
        description="Review recorded Vanguard matches page by page. Search and filters apply to the current page for now."
      />

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search current page..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <select
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as MatchFormat | "All")
            }
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All formats</option>
            <option value="Any">Any</option>
            <option value="Standard">Standard</option>
            <option value="Stride">Stride</option>
          </select>

          <select
            value={result}
            onChange={(event) => setResult(event.target.value as ResultFilter)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All results</option>
            <option value="Decided">Decided</option>
            <option value="Undecided">Undecided</option>
          </select>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => loadMatches(pagination.page, pageSize)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div className="flex flex-wrap gap-3">
            <span>{pagination.total_items} total matches</span>
            <span>•</span>
            <span>
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <span>•</span>
            <span>{filteredMatches.length} shown on this page</span>
          </div>

          {(search || format !== "All" || result !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFormat("All");
                setResult("All");
              }}
              className="text-cyan-200 transition hover:text-cyan-100"
            >
              Clear page filters
            </button>
          )}
        </div>
      </section>

      {error ? (
        <div className="mt-6 rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading matches...
        </div>
      ) : filteredMatches.length ? (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {filteredMatches.map((match) => (
            <MatchCard key={match.id} match={match} onDelete={handleDelete} />
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
          <p className="text-lg font-bold text-slate-300">No matches found.</p>
          <p className="mt-2 text-sm text-slate-500">
            Try changing the page filters, or go roll something spicy in Play Lab.
          </p>
        </section>
      )}

      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-white/10 bg-slate-950/45 p-4">
        <button
          type="button"
          onClick={() => goToPage(pagination.page - 1)}
          disabled={!pagination.has_prev || loading}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        <div className="text-sm text-slate-500">
          Showing{" "}
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
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </section>
    </>
  );
}