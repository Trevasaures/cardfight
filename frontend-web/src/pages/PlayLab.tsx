import { useEffect, useMemo, useState } from "react";
import { Dices, RefreshCcw, Save, Shuffle, Swords } from "lucide-react";

import { getDecks } from "../api/decks";
import { createMatch } from "../api/matches";
import { getRandomMatchup } from "../api/play";
import { FormatBadge } from "../components/badges/FormatBadge";
import { PageHeader } from "../components/layout/PageHeader";
import type { Deck, MatchFormat, RandomMatchupResponse } from "../types/api";
import { formatPercent, formatRecord } from "../utils/format";

type MatchupMode = "random" | "custom";

function MatchupDeckPanel({
  deck,
  selected,
  label,
  onClick,
}: {
  deck: Deck;
  selected?: boolean;
  label?: string;
  onClick?: () => void;
}) {
  const iconPath = deck.nation_icon ? `/nations/${deck.nation_icon}` : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[2rem] border p-6 text-left shadow-2xl shadow-black/20 transition",
        selected
          ? "border-cyan-300/60 bg-cyan-300/10"
          : "border-white/10 bg-slate-950/50 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-slate-900/70",
      ].join(" ")}
    >
      {label ? (
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
          {label}
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            {iconPath ? (
              <img
                src={iconPath}
                alt={deck.nation ?? "Nation icon"}
                className="h-10 w-10 object-contain"
              />
            ) : (
              <span className="text-lg font-black text-slate-600">?</span>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-2xl font-black tracking-tight text-slate-50">
              {deck.name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {deck.nation ?? "No nation"}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {formatRecord(deck.wins, deck.losses)} · {formatPercent(deck.win_pct)}
            </p>
          </div>
        </div>

        <FormatBadge type={deck.type} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Wins</p>
          <p className="mt-1 text-xl font-bold">{deck.wins}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Losses</p>
          <p className="mt-1 text-xl font-bold">{deck.losses}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Games</p>
          <p className="mt-1 text-xl font-bold">{deck.decided_games}</p>
        </div>
      </div>
    </button>
  );
}

export function PlayLab() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [mode, setMode] = useState<MatchupMode>("random");
  const [format, setFormat] = useState<MatchFormat>("Any");

  const [customDeck1Id, setCustomDeck1Id] = useState<number | "">("");
  const [customDeck2Id, setCustomDeck2Id] = useState<number | "">("");

  const [matchup, setMatchup] = useState<RandomMatchupResponse | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [firstPlayerId, setFirstPlayerId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDecks(false)
      .then(setDecks)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load decks"),
      )
      .finally(() => setLoadingDecks(false));
  }, []);

  const eligibleDecks = useMemo(() => {
    if (format === "Any") return decks;
    return decks.filter((deck) => deck.type === format);
  }, [decks, format]);

  const eligibleDeckCount = eligibleDecks.length;

  const customDeck1 = useMemo(
    () => eligibleDecks.find((deck) => deck.id === customDeck1Id) ?? null,
    [eligibleDecks, customDeck1Id],
  );

  const customDeck2 = useMemo(
    () => eligibleDecks.find((deck) => deck.id === customDeck2Id) ?? null,
    [eligibleDecks, customDeck2Id],
  );

  useEffect(() => {
    if (
      customDeck1Id !== "" &&
      !eligibleDecks.some((deck) => deck.id === customDeck1Id)
    ) {
      setCustomDeck1Id("");
    }

    if (
      customDeck2Id !== "" &&
      !eligibleDecks.some((deck) => deck.id === customDeck2Id)
    ) {
      setCustomDeck2Id("");
    }
  }, [eligibleDecks, customDeck1Id, customDeck2Id]);

  async function rollMatchup() {
    setError(null);
    setMessage(null);
    setRolling(true);

    try {
      const result = await getRandomMatchup(format);
      setMatchup(result);
      setWinnerId(null);
      setFirstPlayerId(result.first_player.id);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to roll matchup");
    } finally {
      setRolling(false);
    }
  }

  function buildCustomMatchup() {
    setError(null);
    setMessage(null);

    if (!customDeck1 || !customDeck2) {
      setError("Choose two decks before creating a custom matchup.");
      return;
    }

    if (customDeck1.id === customDeck2.id) {
      setError("A deck cannot fight itself. Even Vanguard has limits.");
      return;
    }

    setMatchup({
      deck1: customDeck1,
      deck2: customDeck2,
      first_player: customDeck1,
      format,
    });

    setWinnerId(null);
    setFirstPlayerId(customDeck1.id);
    setNotes("");
  }

  async function saveMatch() {
    if (!matchup) return;

    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      await createMatch({
        deck1_id: matchup.deck1.id,
        deck2_id: matchup.deck2.id,
        winner_id: winnerId,
        first_player_id: firstPlayerId,
        format,
        notes,
      });

      setMessage("Match saved. The records are updated and the battle is logged.");
      setMatchup(null);
      setWinnerId(null);
      setFirstPlayerId(null);
      setNotes("");

      const refreshedDecks = await getDecks(false);
      setDecks(refreshedDecks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Play Lab"
        title="Matchup control center"
        description="Roll a random Vanguard matchup or build a custom pairing, then log the first player, winner, and notes."
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                Match setup
              </p>
              <h3 className="mt-2 text-xl font-bold">Choose a pool</h3>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["Any", "Standard", "Stride"] as MatchFormat[]).map((item) => (
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
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(["random", "custom"] as MatchupMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError(null);
                  setMessage(null);
                }}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm font-bold capitalize transition",
                  mode === item
                    ? "border-violet-300/50 bg-violet-300/15 text-violet-100"
                    : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                {item === "random" ? "Random roll" : "Custom matchup"}
              </button>
            ))}
          </div>

          {mode === "random" ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-400">
                Eligible active decks:{" "}
                <span className="font-bold text-slate-100">
                  {eligibleDeckCount}
                </span>
              </p>

              <button
                type="button"
                onClick={rollMatchup}
                disabled={rolling || loadingDecks || eligibleDeckCount < 2}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rolling ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Dices className="h-4 w-4" />
                )}
                Roll matchup
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-300">
                    Deck one
                  </span>
                  <select
                    value={customDeck1Id}
                    onChange={(event) =>
                      setCustomDeck1Id(
                        event.target.value ? Number(event.target.value) : "",
                      )
                    }
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                  >
                    <option value="">Select deck...</option>
                    {eligibleDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} — {deck.type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-300">
                    Deck two
                  </span>
                  <select
                    value={customDeck2Id}
                    onChange={(event) =>
                      setCustomDeck2Id(
                        event.target.value ? Number(event.target.value) : "",
                      )
                    }
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                  >
                    <option value="">Select deck...</option>
                    {eligibleDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} — {deck.type}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={buildCustomMatchup}
                    disabled={
                      loadingDecks ||
                      !customDeck1 ||
                      !customDeck2 ||
                      customDeck1.id === customDeck2.id
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Shuffle className="h-4 w-4" />
                    Create matchup
                  </button>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-500">
                Custom matchups use the selected format pool and active decks only.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/70">
            Save mode
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Winner can be left blank to save an undecided/log-only match. Custom
            matchups are perfect for testing specific pairings without rolling the
            dice every time.
          </p>
        </div>
      </section>

      {error ? (
        <div className="mt-6 rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-100">
          {message}
        </div>
      ) : null}

      {matchup ? (
        <section className="mt-8">
          <div className="mb-5 flex items-center justify-center gap-3 text-slate-400">
            <Swords className="h-5 w-5 text-cyan-200" />
            <span className="text-sm font-bold uppercase tracking-[0.24em]">
              Featured battle
            </span>
          </div>

          <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
            <MatchupDeckPanel
              deck={matchup.deck1}
              selected={winnerId === matchup.deck1.id}
              label={firstPlayerId === matchup.deck1.id ? "Goes first" : undefined}
              onClick={() => setWinnerId(matchup.deck1.id)}
            />

            <div className="flex items-center justify-center">
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-slate-300">
                VS
              </div>
            </div>

            <MatchupDeckPanel
              deck={matchup.deck2}
              selected={winnerId === matchup.deck2.id}
              label={firstPlayerId === matchup.deck2.id ? "Goes first" : undefined}
              onClick={() => setWinnerId(matchup.deck2.id)}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-slate-300">First player</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[matchup.deck1, matchup.deck2].map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setFirstPlayerId(deck.id)}
                    className={[
                      "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                      firstPlayerId === deck.id
                        ? "border-violet-300/50 bg-violet-300/15 text-violet-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                    ].join(" ")}
                  >
                    {deck.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-slate-300">Winner</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[matchup.deck1, matchup.deck2].map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setWinnerId(deck.id)}
                    className={[
                      "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                      winnerId === deck.id
                        ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                    ].join(" ")}
                  >
                    {deck.name}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setWinnerId(null)}
                  className={[
                    "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                    winnerId === null
                      ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  Undecided
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm font-semibold text-slate-300" htmlFor="notes">
              Match notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional notes: close game, misplay, testing build, trigger goblin crimes..."
              className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setWinnerId(null);
                  setNotes("");
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
              >
                Clear result
              </button>

              <button
                type="button"
                onClick={saveMatch}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save match"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
          <p className="text-lg font-bold text-slate-300">No matchup selected yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Roll a random matchup or build a custom one. The deck goblin supports both.
          </p>
        </section>
      )}
    </>
  );
}