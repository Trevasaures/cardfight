import { useEffect, useState } from "react";

import { getDashboard } from "../api/dashboard";
import { MatchCard } from "../components/cards/MatchCard";
import { StatCard } from "../components/cards/StatCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import type { DashboardResponse } from "../types/api";
import { formatPercent, formatRecord } from "../utils/format";

export function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="Dashboard"
          title="Loading Cardfight Lab..."
          description="Fetching your match data from the Flask API."
        />
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading...
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader
          eyebrow="Dashboard"
          title="Dashboard unavailable"
          description="The application could not load dashboard data. The notification includes the failure details."
        />
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-slate-400">
          Check that the Flask API is running, then refresh this page.
        </div>
      </>
    );
  }

  const best = data.best_win_rate_deck;
  const mostPlayed = data.most_played_deck;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Welcome back, fighter."
        description="Your Vanguard testing hub is online. Track match history, deck performance, rivalries, and the slow march toward extremely unnecessary but beautiful deck analytics."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Decks" value={data.summary.total_decks} />
        <StatCard label="Active Decks" value={data.summary.active_decks} />
        <StatCard label="Total Matches" value={data.summary.total_matches} />
        <StatCard label="Undecided" value={data.summary.undecided_matches} />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            Best Win Rate
          </p>

          {best ? (
            <>
              <h3 className="mt-4 text-2xl font-bold">{best.deck.name}</h3>
              <p className="mt-2 text-slate-400">
                {formatRecord(best.wins, best.losses)} · {formatPercent(best.win_pct)}
              </p>
            </>
          ) : (
            <p className="mt-4 text-slate-500">No decided matches yet.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/70">
            Most Played
          </p>

          {mostPlayed ? (
            <>
              <h3 className="mt-4 text-2xl font-bold">{mostPlayed.deck.name}</h3>
              <p className="mt-2 text-slate-400">
                {mostPlayed.logged_games} logged games ·{" "}
                {formatRecord(mostPlayed.wins, mostPlayed.losses)}
              </p>
            </>
          ) : (
            <p className="mt-4 text-slate-500">No matches logged yet.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Recent Matches</h3>
            <p className="mt-1 text-sm text-slate-500">
              Latest games pulled directly from the new API.
            </p>
          </div>
        </div>

        {data.recent_matches.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.recent_matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-500">
            No matches logged yet.
          </div>
        )}
      </section>
    </>
  );
}
