import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  Crosshair,
  Filter,
  Gauge,
  RefreshCcw,
  Search,
} from "lucide-react";

import { getPerformanceSpotlight, getStatsTable } from "../api/stats";
import { PerformanceSpotlight } from "../components/analytics/PerformanceSpotlight";
import { FormatBadge } from "../components/badges/FormatBadge";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import type {
  DeckType,
  PerformanceSpotlightResponse,
  StatsRow,
} from "../types/api";
import { formatPercent, formatRecord } from "../utils/format";

type FormatFilter = "All" | DeckType;

function nationIcon(row: StatsRow) {
  return row.deck.nation_icon ? `/nations/${row.deck.nation_icon}` : null;
}

export function Analytics() {
  const [rows, setRows] = useState<StatsRow[]>([]);
  const [spotlight, setSpotlight] = useState<PerformanceSpotlightResponse | null>(
    null,
  );
  const [format, setFormat] = usePersistentState<FormatFilter>(
    "cardfight.analytics.format",
    "All",
  );
  const [activeOnly, setActiveOnly] = usePersistentState(
    "cardfight.analytics.active-only",
    true,
  );
  const [selectedDeckId, setSelectedDeckId] = usePersistentState<number | null>(
    "cardfight.analytics.spotlight-deck",
    null,
  );
  const [search, setSearch] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingSpotlight, setLoadingSpotlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  useEffect(() => {
    getStatsTable()
      .then((nextRows) => {
        setRows(nextRows);
        setSelectedDeckId((current) => {
          if (current && nextRows.some((row) => row.id === current)) return current;
          const defaultRow = nextRows
            .slice()
            .sort((a, b) => b.decided_games - a.decided_games)[0];
          return defaultRow?.id ?? null;
        });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load analytics"),
      )
      .finally(() => setLoadingRows(false));
  }, [setSelectedDeckId]);

  useEffect(() => {
    if (!selectedDeckId) {
      setSpotlight(null);
      return;
    }

    let active = true;
    setLoadingSpotlight(true);

    getPerformanceSpotlight(selectedDeckId)
      .then((payload) => {
        if (active) setSpotlight(payload);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load deck spotlight",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingSpotlight(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDeckId]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFormat = format === "All" || row.type === format;
      const matchesActive = !activeOnly || row.active;
      const matchesSearch =
        !query ||
        row.name.toLowerCase().includes(query) ||
        (row.deck.nation ?? "").toLowerCase().includes(query);
      return matchesFormat && matchesActive && matchesSearch;
    });
  }, [activeOnly, format, rows, search]);

  const rankedRows = useMemo(
    () =>
      filteredRows
        .filter((row) => row.decided_games > 0)
        .slice()
        .sort((a, b) => {
          if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct;
          return b.decided_games - a.decided_games;
        }),
    [filteredRows],
  );

  async function refreshSpotlight() {
    if (!selectedDeckId) return;
    setLoadingSpotlight(true);
    try {
      const payload = await getPerformanceSpotlight(selectedDeckId);
      setSpotlight(payload);
      toast.success(`Refreshed ${payload.deck.name}'s performance spotlight.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh spotlight");
    } finally {
      setLoadingSpotlight(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Analytics · Performance Spotlight"
        title="See what the record is really saying"
        description="Focus on one deck at a time, read its recent trajectory, expose its turn-order split, and turn match history into the next useful testing decision."
      />

      <section
        data-anime="motion-panel"
        className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 sm:p-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
              <Crosshair className="h-4 w-4" /> Spotlight controls
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Choose the deck you are actively testing. The selection stays with you when you leave and return.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a deck or nation..."
                className="w-full rounded-xl border border-white/10 bg-slate-950/65 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/45"
              />
            </label>
            <button
              type="button"
              onClick={() => void refreshSpotlight()}
              disabled={!selectedDeckId || loadingSpotlight}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40"
            >
              <RefreshCcw className={`h-4 w-4 ${loadingSpotlight ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <span className="mr-1 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600">
            <Filter className="h-3.5 w-3.5" /> Field
          </span>
          {(["All", "Standard", "Stride"] as FormatFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFormat(item)}
              className={[
                "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                format === item
                  ? "border-cyan-300/45 bg-cyan-300/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-slate-100",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveOnly((value) => !value)}
            className={[
              "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              activeOnly
                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-slate-100",
            ].join(" ")}
          >
            Active only
          </button>
        </div>

        {loadingRows ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-2xl bg-white/[0.045]" />
            ))}
          </div>
        ) : filteredRows.length ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {filteredRows.map((row) => {
              const icon = nationIcon(row);
              const selected = row.id === selectedDeckId;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedDeckId(row.id)}
                  className={[
                    "group flex w-56 shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition",
                    selected
                      ? "border-cyan-300/45 bg-cyan-300/[0.11] shadow-[0_0_28px_rgba(34,211,238,0.08)]"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.055]",
                  ].join(" ")}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70">
                    {icon ? (
                      <img src={icon} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <Gauge className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{row.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRecord(row.wins, row.losses)} · {formatPercent(row.win_pct)}
                    </p>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition ${selected ? "text-cyan-200" : "text-slate-700 group-hover:text-slate-400"}`}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">
            No decks match these spotlight controls.
          </div>
        )}
      </section>

      <div className="mt-6">
        {loadingSpotlight && !spotlight ? (
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-8">
            <div className="h-[32rem] animate-pulse rounded-3xl bg-white/[0.04]" />
          </div>
        ) : spotlight ? (
          <PerformanceSpotlight key={spotlight.deck.id} spotlight={spotlight} />
        ) : (
          <div className="rounded-[2rem] border border-dashed border-white/10 p-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-4 text-lg font-black text-slate-300">Choose a deck to light the spotlight.</p>
          </div>
        )}
      </div>

      {rankedRows.length ? (
        <section data-anime="motion-panel" className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Field signal</p>
              <h3 className="mt-2 text-xl font-black text-white">Performance board</h3>
            </div>
            <p className="text-sm text-slate-500">Win rate uses decided games only. Sample size stays visible beside every result.</p>
          </div>

          <div className="mt-5 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {rankedRows.map((row, index) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelectedDeckId(row.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.045]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xs font-black text-slate-500">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black text-white">{row.name}</p>
                    <FormatBadge type={row.type} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatRecord(row.wins, row.losses)} · {row.decided_games} decided</p>
                </div>
                <p className="text-lg font-black text-cyan-100">{formatPercent(row.win_pct)}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
