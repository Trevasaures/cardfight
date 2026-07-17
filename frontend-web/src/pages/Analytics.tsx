import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getStatsTable } from "../api/stats";
import { FormatBadge } from "../components/badges/FormatBadge";
import { StatusBadge } from "../components/badges/StatusBadge";
import { StatCard } from "../components/cards/StatCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import type { DeckType, StatsRow } from "../types/api";
import { formatPercent, formatRecord } from "../utils/format";

type FormatFilter = "All" | DeckType;

export function Analytics() {
  const [rows, setRows] = useState<StatsRow[]>([]);
  const [format, setFormat] = useState<FormatFilter>("All");
  const [activeOnly, setActiveOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  useEffect(() => {
    getStatsTable()
      .then(setRows)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load analytics"),
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesFormat = format === "All" || row.type === format;
      const matchesActive = !activeOnly || row.active;

      return matchesFormat && matchesActive;
    });
  }, [rows, format, activeOnly]);

  const chartRows = useMemo(() => {
    return filteredRows
      .filter((row) => row.decided_games > 0)
      .slice()
      .sort((a, b) => b.win_pct - a.win_pct)
      .map((row) => ({
        name: row.name,
        winPct: Number((row.win_pct * 100).toFixed(1)),
        wins: row.wins,
        losses: row.losses,
        decided: row.decided_games,
        logged: row.logged_games,
      }));
  }, [filteredRows]);

  const totalDecided = filteredRows.reduce(
    (sum, row) => sum + row.decided_games,
    0,
  );
  const totalLogged = filteredRows.reduce((sum, row) => sum + row.logged_games, 0);
  const totalUndecided = filteredRows.reduce((sum, row) => sum + row.undecided, 0);
  const activeDecks = filteredRows.filter((row) => row.active).length;

  const bestDeck = filteredRows
    .filter((row) => row.decided_games > 0)
    .slice()
    .sort((a, b) => {
      if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct;
      return b.decided_games - a.decided_games;
    })[0];

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Deck performance"
        description="Stats are calculated directly from match history, so undecided games are tracked separately and never counted as losses."
      />

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
              Filters
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Narrow the analytics without changing the underlying data.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["All", "Standard", "Stride"] as FormatFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormat(item)}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  format === item
                    ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                {item}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setActiveOnly((value) => !value)}
              className={[
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                activeOnly
                  ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
              ].join(" ")}
            >
              Active only
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading analytics...
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Decks shown" value={filteredRows.length} />
            <StatCard label="Active shown" value={activeDecks} />
            <StatCard label="Decided games" value={totalDecided} />
            <StatCard label="Undecided entries" value={totalUndecided} />
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/45 p-6">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">Win rate by deck</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Only decks with decided games are shown.
                  </p>
                </div>
              </div>

              {chartRows.length ? (
                <div className="h-[26rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartRows}
                      layout="vertical"
                      margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        tickFormatter={(value) => `${value}%`}
                        stroke="rgba(255,255,255,0.15)"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fill: "#cbd5e1", fontSize: 12 }}
                        stroke="rgba(255,255,255,0.15)"
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{
                          background: "#020617",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "16px",
                          color: "#f8fafc",
                        }}
                        formatter={(value, name) => {
                          if (name === "winPct") return [`${value}%`, "Win rate"];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="winPct" radius={[0, 12, 12, 0]} fill="#7dd3fc" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center text-slate-500">
                  No decided games available for this filter.
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/45 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/70">
                Current leader
              </p>

              {bestDeck ? (
                <>
                  <h3 className="mt-4 text-3xl font-black tracking-tight">
                    {bestDeck.name}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <FormatBadge type={bestDeck.type} />
                    <StatusBadge active={bestDeck.active} />
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">Record</p>
                      <p className="mt-1 text-xl font-bold">
                        {formatRecord(bestDeck.wins, bestDeck.losses)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">Win rate</p>
                      <p className="mt-1 text-xl font-bold">
                        {formatPercent(bestDeck.win_pct)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-slate-500">No leader yet.</p>
              )}

              <p className="mt-6 text-sm leading-6 text-slate-500">
                Logged games shown in analytics: {totalLogged}. Decided games drive win
                rate. Undecided entries are tracked separately.
              </p>
            </div>
          </section>

          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-xl font-bold">Deck table</h3>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-2">Deck</th>
                    <th className="px-4 py-2">Format</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Record</th>
                    <th className="px-4 py-2">Win rate</th>
                    <th className="px-4 py-2">Logged</th>
                    <th className="px-4 py-2">Undecided</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="bg-slate-950/45">
                      <td className="rounded-l-2xl px-4 py-3 font-bold text-slate-100">
                        {row.name}
                      </td>
                      <td className="px-4 py-3">
                        <FormatBadge type={row.type} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={row.active} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatRecord(row.wins, row.losses)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatPercent(row.win_pct)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.logged_games}</td>
                      <td className="rounded-r-2xl px-4 py-3 text-slate-300">
                        {row.undecided}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
