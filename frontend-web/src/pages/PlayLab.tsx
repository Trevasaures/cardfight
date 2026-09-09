import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Dices, RefreshCcw, Save, Shuffle, Swords } from "lucide-react";

import { getDecks } from "../api/decks";
import { createMatch } from "../api/matches";
import { getRandomMatchup } from "../api/play";
import { usePlayLabReveal } from "../animations/usePlayLabReveal";
import { FormatBadge } from "../components/badges/FormatBadge";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkspaceSectionHeader } from "../components/layout/WorkspaceSectionHeader";
import { usePersistentState } from "../hooks/usePersistentState";
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
      aria-pressed={selected ?? false}
      aria-label={`Select ${deck.name} as the winner`}
      className={[
        "h-full w-full min-w-0 overflow-hidden rounded-2xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/60",
        selected
          ? "border-emerald-300/40 bg-emerald-300/[0.07]"
          : "border-white/10 bg-black/20 hover:border-cyan-300/30 hover:bg-white/[0.04]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            data-anime="nation-icon"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] will-change-transform"
          >
            {iconPath ? (
              <img
                src={iconPath}
                alt={deck.nation ?? "Nation icon"}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <span className="text-lg font-black text-slate-600">?</span>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="break-words text-lg font-black tracking-tight text-slate-50">
              {deck.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {deck.nation ?? "No nation"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <FormatBadge type={deck.type} />
          {label ? <span className="text-[0.65rem] font-bold text-violet-200">{label}</span> : null}
          {selected ? (
            <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> Winner
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-white/[0.02]">
        {[
          { label: "Record", value: formatRecord(deck.wins, deck.losses) },
          { label: "Win rate", value: formatPercent(deck.win_pct) },
          { label: "Games", value: deck.decided_games },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 px-3 py-2.5">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-500">{stat.label}</p>
            <p className="mt-0.5 text-sm font-black tabular-nums text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>
    </button>
  );
}

export function PlayLab() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [mode, setMode] = usePersistentState<MatchupMode>(
    "cardfight.play-lab.mode",
    "random",
  );
  const [format, setFormat] = usePersistentState<MatchFormat>(
    "cardfight.play-lab.format",
    "Any",
  );

  const [customDeck1Id, setCustomDeck1Id] = usePersistentState<number | "">(
    "cardfight.play-lab.custom-deck-one",
    "",
  );
  const [customDeck2Id, setCustomDeck2Id] = usePersistentState<number | "">(
    "cardfight.play-lab.custom-deck-two",
    "",
  );

  const [matchup, setMatchup] =
    usePersistentState<RandomMatchupResponse | null>(
      "cardfight.play-lab.matchup",
      null,
    );
  const [winnerId, setWinnerId] = usePersistentState<number | null>(
    "cardfight.play-lab.winner",
    null,
  );
  const [firstPlayerId, setFirstPlayerId] = usePersistentState<number | null>(
    "cardfight.play-lab.first-player",
    null,
  );
  const [notes, setNotes] = usePersistentState(
    "cardfight.play-lab.notes",
    "",
  );

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const matchupStageRef = useRef<HTMLElement | null>(null);
  const [revealTrigger, setRevealTrigger] = useState(0);

  usePlayLabReveal(matchupStageRef, revealTrigger);

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }

    if (message) {
      toast.success(message);
      setMessage(null);
    }
  }, [error, message, toast]);

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
    if (loadingDecks) return;

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
  }, [
    eligibleDecks,
    customDeck1Id,
    customDeck2Id,
    loadingDecks,
    setCustomDeck1Id,
    setCustomDeck2Id,
  ]);

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
      setRevealTrigger((value) => value + 1);
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
    setRevealTrigger((value) => value + 1);
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

  function discardMatchDraft() {
    if (
      (notes.trim() || winnerId !== null) &&
      !window.confirm("Discard this unsaved match and its notes?")
    ) {
      return;
    }

    setMatchup(null);
    setWinnerId(null);
    setFirstPlayerId(null);
    setNotes("");
    setMessage("Local match draft cleared.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Play Lab"
        title="Matchup control center"
        description="Roll a random Vanguard matchup or build a custom pairing, then log the first player, winner, and notes."
      />

      <section className="workspace-panel">
          <WorkspaceSectionHeader
            eyebrow="Setup"
            title="Choose your matchup"
            description="Pick the format and let the lab roll, or select two active decks."
            actions={
              <span className="text-xs text-slate-400">
                <strong className="text-slate-200">{eligibleDeckCount}</strong> eligible decks
              </span>
            }
          />

          <div className="workspace-inset mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Match format">
              <span className="mr-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-500">Format</span>
              {(["Any", "Standard", "Stride"] as MatchFormat[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFormat(item)}
                  aria-pressed={format === item}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                    format === item
                      ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/20 p-1" role="group" aria-label="Matchup selection">
            {(["random", "custom"] as MatchupMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setError(null);
                  setMessage(null);
                }}
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-bold transition",
                  mode === item
                    ? "border-violet-300/50 bg-violet-300/15 text-violet-100"
                    : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
                ].join(" ")}
              >
                {item === "random" ? "Random roll" : "Custom matchup"}
              </button>
            ))}
          </div>
          </div>

          {mode === "random" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <p className="text-sm text-slate-400">
                {eligibleDeckCount < 2
                  ? "Add at least two active decks in this format to roll."
                  : "Draw two decks and a starting player from this pool."}
              </p>

              <button
                type="button"
                onClick={rollMatchup}
                disabled={rolling || loadingDecks || eligibleDeckCount < 2}
                className="workspace-button inline-flex items-center gap-2 bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="p-3">
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="grid min-w-0 gap-1.5">
                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                    Deck one
                  </span>
                  <select
                    value={customDeck1Id}
                    onChange={(event) =>
                      setCustomDeck1Id(
                        event.target.value ? Number(event.target.value) : "",
                      )
                    }
                    className="workspace-control w-full min-w-0 border border-white/10 bg-black/30 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                  >
                    <option value="">Select deck...</option>
                    {eligibleDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} — {deck.type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid min-w-0 gap-1.5">
                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                    Deck two
                  </span>
                  <select
                    value={customDeck2Id}
                    onChange={(event) =>
                      setCustomDeck2Id(
                        event.target.value ? Number(event.target.value) : "",
                      )
                    }
                    className="workspace-control w-full min-w-0 border border-white/10 bg-black/30 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                  >
                    <option value="">Select deck...</option>
                    {eligibleDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} — {deck.type}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end sm:col-span-2 xl:col-span-1">
                  <button
                    type="button"
                    onClick={buildCustomMatchup}
                    disabled={
                      loadingDecks ||
                      !customDeck1 ||
                      !customDeck2 ||
                      customDeck1.id === customDeck2.id
                    }
                    className="workspace-button inline-flex w-full items-center justify-center gap-2 bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Shuffle className="h-4 w-4" />
                    Create matchup
                  </button>
                </div>
              </div>

              <p className="mt-2.5 text-xs text-slate-500">
                Custom matchups use the selected format pool and active decks only.
              </p>
            </div>
          )}
          </div>
          {matchup ? (
            <p className="mt-3 text-xs text-slate-500">
              Starting another matchup replaces the current draft. Save its result and notes below first.
            </p>
          ) : null}
      </section>

      {matchup ? (
        <section ref={matchupStageRef} className="workspace-panel mt-4">
          <WorkspaceSectionHeader
            eyebrow="Battle"
            title="Record your result"
            description="Click a deck to choose the winner, or leave the match undecided."
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Draft saved locally
                </span>
                <button
                  type="button"
                  onClick={discardMatchDraft}
                  className="workspace-button border border-white/10 px-3 text-xs font-bold text-slate-400 transition hover:border-rose-300/20 hover:bg-rose-300/5 hover:text-rose-200"
                >
                  Discard draft
                </button>
              </div>
            }
          />

          <div className="mt-4 grid items-stretch gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div data-anime="deck-left" className="min-w-0 will-change-transform">
              <MatchupDeckPanel
                deck={matchup.deck1}
                selected={winnerId === matchup.deck1.id}
                label={firstPlayerId === matchup.deck1.id ? "Goes first" : undefined}
                onClick={() => setWinnerId(matchup.deck1.id)}
              />
            </div>

            <div
              data-anime="vs-badge"
              className="flex items-center justify-center will-change-transform"
            >
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black text-slate-400">
                VS
              </div>
            </div>

            <div data-anime="deck-right" className="min-w-0 will-change-transform">
              <MatchupDeckPanel
                deck={matchup.deck2}
                selected={winnerId === matchup.deck2.id}
                label={firstPlayerId === matchup.deck2.id ? "Goes first" : undefined}
                onClick={() => setWinnerId(matchup.deck2.id)}
              />
            </div>
          </div>

          <div className="workspace-inset mt-4 grid overflow-hidden divide-y divide-white/10 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:divide-x xl:divide-y-0">
            <fieldset
              data-anime="match-control-panel"
              className="min-w-0 p-3"
            >
              <legend className="sr-only">First player</legend>
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400" aria-hidden="true">First player</p>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[matchup.deck1, matchup.deck2].map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setFirstPlayerId(deck.id)}
                    aria-pressed={firstPlayerId === deck.id}
                    className={[
                      "workspace-button min-w-0 break-words border px-3 py-2 text-left text-sm font-semibold transition",
                      firstPlayerId === deck.id
                        ? "border-violet-300/50 bg-violet-300/15 text-violet-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                    ].join(" ")}
                  >
                    {deck.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset
              data-anime="match-control-panel"
              className="min-w-0 p-3"
            >
              <legend className="sr-only">Winner</legend>
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400" aria-hidden="true">Winner</p>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {[matchup.deck1, matchup.deck2].map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setWinnerId(deck.id)}
                    aria-pressed={winnerId === deck.id}
                    className={[
                      "workspace-button min-w-0 break-words border px-3 py-2 text-left text-sm font-semibold transition",
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
                  aria-pressed={winnerId === null}
                  className={[
                    "workspace-button min-w-0 border px-3 py-2 text-left text-sm font-semibold transition",
                    winnerId === null
                      ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  Undecided
                </button>
              </div>
            </fieldset>
          </div>

          <div
            data-anime="notes-panel"
            className="mt-4"
          >
            <label className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400" htmlFor="notes">
              Match notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional notes: close game, misplay, testing build, trigger goblin crimes..."
              className="mt-2 block w-full min-w-0 resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Undecided matches save to history without a win or loss.
              </p>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setWinnerId(null);
                  setNotes("");
                }}
                className="workspace-button border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-200"
              >
                Clear result & notes
              </button>

              <button
                type="button"
                onClick={saveMatch}
                disabled={saving}
                className="workspace-button inline-flex items-center gap-2 bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save match"}
              </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
          <Swords className="mb-2 h-5 w-5 text-cyan-200/70" />
          <p className="text-sm font-bold text-slate-300">Your next battle starts here.</p>
          <p className="mt-2 text-sm text-slate-500">
            Roll a matchup or choose two decks above. Your match and notes will stay here when you return.
          </p>
        </section>
      )}
    </>
  );
}
