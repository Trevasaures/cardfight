import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Eye,
  Layers3,
  Minus,
  Plus,
  RotateCcw,
  Shuffle,
  Swords,
  Undo2,
  Zap,
} from "lucide-react";
import { CardAbilityText } from "../../components/cards/CardAbilityText";
import type { DeckVersion } from "../../types/api";
import { nationColor } from "../../utils/nations";
import type { CardCopy } from "./engine";
import {
  beginCheck,
  canDropCards,
  changeCards,
  changeEnergy,
  CIRCLES,
  findCard,
  finishMulligan,
  listCopies,
  moveCards,
  nextPhase,
  PHASES,
  resolveCheck,
  shuffleDeck,
  startTable,
  takeTop,
  ZONES,
  type TableCard,
  type TableSession,
  type Zone,
} from "./playtest";
import { useCardDrag } from "./useCardDrag";
import { PlaytestCard } from "./PlaytestCard";
import { PlaytestZone } from "./PlaytestZone";
import { SelectedCardActions } from "./SelectedCardActions";
import { CardDragPreview } from "./CardDragPreview";
import "./playtest.css";

type Props = { version: DeckVersion; copies: CardCopy[] };
type History = { past: TableSession[]; present: TableSession | null };

function getNextPhaseLabel(session: TableSession | null): string {
  if (!session) return "";
  if (session.active === "opponent") return "Start my turn";
  if (session.phase === "end") return "End turn";
  if (session.phase === "stand") return "Draw phase · +1";

  // Match the first-player battle skip used by the table's phase transition.
  if (session.phase === "main" && session.first && session.turn === 1) {
    return "End phase";
  }

  return `${PHASES[PHASES.indexOf(session.phase) + 1]} phase`;
}

export function HandTable({ version, copies }: Props) {
  const [history, setHistory] = useState<History>({ past: [], present: null });
  const [first, setFirst] = useState(true);
  const inventory = useMemo(() => {
    try {
      return { cards: listCopies(version.cards), error: "" };
    } catch (error) {
      return {
        cards: [],
        error:
          error instanceof Error ? error.message : "Could not read this list.",
      };
    }
  }, [version]);
  const entries = new Map(version.cards.map((entry) => [entry.id, entry]));
  const starters = inventory.cards
    .filter((copy) => {
      const entry = entries.get(copy.entryId);
      return (
        entry?.card?.grade === 0 &&
        (entry.zone === "ride" || entry.zone === "main")
      );
    })
    .sort(
      (a, b) =>
        Number(entries.get(b.entryId)?.zone === "ride") -
        Number(entries.get(a.entryId)?.zone === "ride"),
    );
  const [starter, setStarter] = useState(starters[0]?.key ?? "");
  const [setup, setSetup] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState<Zone>("ride");
  const [destination, setDestination] = useState<Zone | "deckTop">("drop");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const tableRef = useRef<HTMLElement>(null);
  const session = history.present;
  const playing = Boolean(session && session.phase !== "mulligan");
  const selection = session
    ? selected.flatMap((key) => {
        const found = findCard(session, key);
        return found ? [found] : [];
      })
    : [];
  const focused = selection.at(-1);
  const focusedEntry = focused && entries.get(focused.card.entryId);
  const checkCard =
    session?.check && findCard(session, session.check.key)?.card;
  const checkEntry = checkCard && entries.get(checkCard.entryId);
  const drawable = playing && Boolean(session?.zones.deck.length);
  const canShuffle = playing && !setup && (session?.zones.deck.length ?? 0) > 1;
  const starterInMain = starters.some(
    (copy) =>
      copy.key === starter && entries.get(copy.entryId)?.zone === "main",
  );

  function apply(next: TableSession, clear = true) {
    if (!session || next === session) return;
    // Store full snapshots so undo restores deck order, checks, and temporary bonuses.
    // Keep at most 80 previous states; repeated no-op actions do not consume history.
    setHistory({ past: [...history.past.slice(-79), session], present: next });
    if (clear) setSelected([]);
    setAnnouncement(next.log.at(-1) ?? "Table updated.");
  }

  function newGame() {
    try {
      const next = startTable(version.cards, first, starter || null);
      setHistory({ past: [], present: next });
      setSelected([]);
      setSetup(false);
      setError("");
      setInspected("ride");
      setQuery("");
      setAnnouncement("Five cards dealt. Select cards for your mulligan.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not start this game.",
      );
    }
  }

  function undo() {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), present: previous });
    setSelected([]);
    setAnnouncement("Last action undone.");
  }

  function shuffleMainDeck() {
    if (!session || !canShuffle) return;
    apply(shuffleDeck(session));
    setQuery("");
  }

  function selectCard(card: TableCard) {
    setSelected((keys) =>
      keys.includes(card.key)
        ? keys.filter((key) => key !== card.key)
        : [...keys, card.key],
    );
  }

  function move(to: Zone, position: "top" | "bottom" = "bottom") {
    if (!session) return;
    if (CIRCLES.includes(to) && selected.length > 1) {
      setAnnouncement("Select one card for a unit circle.");
      return;
    }
    apply(moveCards(session, selected, to, position));
  }

  function openZone(zone: Zone) {
    setInspected(zone);
    setQuery("");
    if (playing) {
      setSelected(
        CIRCLES.includes(zone)
          ? (session?.zones[zone].map((card) => card.key) ?? [])
          : [],
      );
    }
  }

  const { drag, start, onClickCapture, onPointerDownCapture } = useCardDrag({
    root: tableRef,
    canDrop: (keys, zone) =>
      Boolean(session && !setup && canDropCards(session, keys, zone)),
    onDrop: (keys, zone) => {
      if (!session) return;
      apply(moveCards(session, keys, zone));
      setInspected(zone);
      setQuery("");
      setAnnouncement(
        `${keys.length === 1 ? "Card" : `${keys.length} cards`} moved to ${ZONES[zone]}${zone === "deck" ? " bottom" : ""}.`,
      );
    },
    onCancel: () => setAnnouncement("Move cancelled. Cards stayed in place."),
  });
  const dragCard =
    session && drag ? findCard(session, drag.keys[0])?.card : undefined;
  const dragEntry = dragCard && entries.get(dragCard.entryId);

  function dragKeys(card: TableCard) {
    // Drag the selected group only when grabbing one of its members.
    return selected.includes(card.key) ? selected : [card.key];
  }

  function dropClass(zone: Zone) {
    if (!drag || !session) return "";
    const valid = canDropCards(session, drag.keys, zone);
    return `${valid ? "is-destination" : "is-unavailable"} ${drag.target === zone ? (valid ? "is-drop-over" : "is-drop-blocked") : ""}`;
  }

  function zoneButton(zone: Zone) {
    return (
      <PlaytestZone
        key={zone}
        zone={zone}
        cards={session?.zones[zone] ?? []}
        entries={entries}
        selected={selected}
        draggedKeys={drag?.keys ?? []}
        draggable={playing && !setup}
        dropClassName={dropClass(zone)}
        onOpen={openZone}
        onDragStart={(event, card, hidden) =>
          start(event, dragKeys(card), hidden)
        }
      />
    );
  }

  function cardButton(card: TableCard, index: number, compact = false) {
    return (
      <PlaytestCard
        key={card.key}
        card={card}
        entry={entries.get(card.entryId)}
        index={index}
        compact={compact}
        selected={selected.includes(card.key)}
        draggable={playing && !setup}
        dragging={Boolean(drag?.keys.includes(card.key))}
        disabled={!playing && inspected !== "hand" && compact}
        onSelect={selectCard}
        onDragStart={(event, card) => start(event, dragKeys(card))}
      />
    );
  }

  const nextLabel = getNextPhaseLabel(session);
  const inspectedCards = (session?.zones[inspected] ?? []).filter((card) =>
    (entries.get(card.entryId)?.card?.name ?? "")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <section
      ref={tableRef}
      className={`hand-table pt-table ${drag ? "is-dragging" : ""}`}
      onClickCapture={onClickCapture}
      onPointerDownCapture={onPointerDownCapture}
      onDragStart={(event) => event.preventDefault()}
      style={
        {
          "--hand-nation": nationColor(version.deck?.nation ?? null),
        } as CSSProperties
      }
      aria-label="Solo playtest table"
    >
      <div className="hand-table-header">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title">Playtest</h2>
          <span className="hand-phase">
            {session
              ? session.phase === "mulligan"
                ? "Mulligan"
                : session.first
                  ? "Going first"
                  : "Going second"
              : "Solo"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="hand-button"
            onClick={undo}
            disabled={!history.past.length || setup}
            aria-label="Undo last action"
            title="Undo"
          >
            <Undo2 size={15} />
          </button>
          {!setup && (
            <button
              type="button"
              className="hand-button"
              onClick={() => setSetup(true)}
            >
              <RotateCcw size={14} />
              New game
            </button>
          )}
        </div>
      </div>
      {setup && (
        <div className="pt-setup">
          <div className="pt-turn-choice" role="group" aria-label="Turn order">
            <button
              type="button"
              aria-pressed={first}
              onClick={() => setFirst(true)}
            >
              First
            </button>
            <button
              type="button"
              aria-pressed={!first}
              onClick={() => setFirst(false)}
            >
              Second
            </button>
          </div>
          <label>
            First vanguard
            <select
              className="workspace-control"
              value={starter}
              onChange={(event) => setStarter(event.target.value)}
            >
              <option value="">No starter</option>
              {starters.map((copy) => (
                <option key={copy.key} value={copy.key}>
                  {entries.get(copy.entryId)?.card?.name} ·{" "}
                  {entries.get(copy.entryId)?.zone === "ride" ? "Ride" : "Main"}{" "}
                  #{Number(copy.key.split(":")[1]) + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="cinema-button"
            onClick={newGame}
            disabled={
              Boolean(inventory.error) ||
              copies.length - Number(starterInMain) < 5
            }
          >
            <Shuffle size={15} />
            {session ? "Restart & deal" : "Deal five"}
          </button>
          {session && (
            <button
              type="button"
              className="hand-button"
              onClick={() => setSetup(false)}
            >
              Cancel
            </button>
          )}
          {(error || inventory.error) && (
            <p role="alert" className="hand-error">
              {error || inventory.error}
            </p>
          )}
          {copies.length - Number(starterInMain) < 5 && (
            <p className="text-xs text-slate-400">
              Five main-deck cards must remain after choosing your starter.
            </p>
          )}
        </div>
      )}
      {playing && (
        <div className="pt-turn-bar">
          <strong>
            {session!.active === "you"
              ? `Your turn ${session!.turn}`
              : "Opponent's turn"}
          </strong>
          <div className="pt-phases" aria-label="Turn phases">
            {PHASES.map((phase) => (
              <span
                key={phase}
                aria-current={
                  session!.active === "you" && session!.phase === phase
                    ? "step"
                    : undefined
                }
              >
                {phase}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="cinema-button"
            onClick={() => apply(nextPhase(session!))}
            disabled={Boolean(session!.check) || setup}
          >
            {nextLabel}
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div
        className={`pt-layout ${setup && session ? "is-paused" : ""}`}
        inert={setup && session ? true : undefined}
      >
        <div className="pt-board-column">
          <div
            className="pt-board-scroll"
            data-drag-scroll
            tabIndex={0}
            role="region"
            aria-label="Playmat"
          >
            <div className="pt-mat">
              <div className="pt-side">
                {(["ride", "soul", "damage"] as Zone[]).map(zoneButton)}
              </div>
              <div className="pt-field">
                {zoneButton("guardian")}
                {CIRCLES.map(zoneButton)}
              </div>
              <div className="pt-side">
                {(["deck", "drop", "reveal"] as Zone[]).map(zoneButton)}
              </div>
              <div className="pt-aux">
                {(
                  ["crest", "order", "bind", "g", "token", "reserve"] as Zone[]
                ).map(zoneButton)}
              </div>
            </div>
          </div>
          <div className="pt-tools">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="hand-button"
                disabled={!drawable}
                onClick={() => apply(takeTop(session!, "hand"))}
              >
                <ArrowDownToLine size={14} />
                Draw 1
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={
                  !drawable ||
                  Boolean(session?.check) ||
                  session?.active !== "you" ||
                  session?.phase !== "battle"
                }
                onClick={() => {
                  apply(beginCheck(session!, "drive"));
                  setInspected("reveal");
                }}
              >
                <Swords size={14} />
                Drive check
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={!drawable || Boolean(session?.check)}
                onClick={() => {
                  apply(beginCheck(session!, "damage"));
                  setInspected("reveal");
                }}
              >
                Damage check
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={!drawable}
                onClick={() => {
                  apply(takeTop(session!, "soul"));
                  setInspected("soul");
                }}
              >
                Soul charge
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={!drawable}
                onClick={() => {
                  apply(takeTop(session!, "reveal"));
                  setInspected("reveal");
                }}
              >
                <Eye size={14} />
                Reveal 1
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={!canShuffle}
                onClick={shuffleMainDeck}
              >
                <Shuffle size={15} />
                Shuffle deck
              </button>
            </div>
            <div className="pt-energy" aria-label="Energy">
              <Zap size={14} />
              <button
                type="button"
                disabled={!playing || !session?.energy}
                onClick={() => apply(changeEnergy(session!, -1), false)}
                aria-label="Spend one energy"
              >
                <Minus size={13} />
              </button>
              <strong>
                {session?.energy ?? 0}
                <small> / 10</small>
              </strong>
              <button
                type="button"
                disabled={!playing || session?.energy === 10}
                onClick={() => apply(changeEnergy(session!, 1), false)}
                aria-label="Gain one energy"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
          {session?.check && (
            <div className="pt-check" role="status">
              <span>
                <strong>
                  {session.check.kind === "drive" ? "Drive" : "Damage"}
                </strong>{" "}
                · {checkEntry?.card?.name}
                <small>
                  {checkEntry?.card?.trigger_type ||
                    (checkEntry?.card?.card_type
                      .toLowerCase()
                      .includes("trigger")
                      ? "Trigger unit"
                      : "No trigger")}{" "}
                  · effects manual
                </small>
              </span>
              <button
                type="button"
                className="cinema-button"
                onClick={() => apply(resolveCheck(session))}
              >
                To {session.check.kind === "drive" ? "hand" : "damage"}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="pt-hand-header">
            <span>
              Hand <strong>{session?.zones.hand.length ?? 0}</strong>
            </span>
            {session?.phase === "mulligan" ? (
              <button
                type="button"
                className="cinema-button"
                onClick={() => apply(finishMulligan(session, selected))}
              >
                <Check size={14} />
                {selected.length ? `Redraw ${selected.length}` : "Keep hand"}
              </button>
            ) : (
              <span className="pt-hint">Drag cards to a zone</span>
            )}
          </div>
          <div
            className={`pt-hand ${dropClass("hand")}`}
            data-drop-zone="hand"
            data-drag-scroll
            role="group"
            aria-label="Cards in hand"
          >
            {session?.zones.hand.length ? (
              session.zones.hand.map((card, index) => cardButton(card, index))
            ) : (
              <div className="pt-hand-empty">
                <Layers3 size={26} strokeWidth={1} />
                {session ? "Drop cards here" : "Ready to deal"}
              </div>
            )}
          </div>
        </div>
        <aside className="pt-inspector" aria-label="Zone inspector">
          <div className="pt-inspector-header">
            <label className="sr-only" htmlFor="pt-zone-select">
              Inspect zone
            </label>
            <select
              id="pt-zone-select"
              className="workspace-control"
              value={inspected}
              onChange={(event) => {
                setInspected(event.target.value as Zone);
                setQuery("");
              }}
            >
              {(Object.keys(ZONES) as Zone[]).map((zone) => (
                <option key={zone} value={zone}>
                  {ZONES[zone]} · {session?.zones[zone].length ?? 0}
                </option>
              ))}
            </select>
          </div>
          {inspected === "deck" && (
            <div className="pt-inspector-tools">
              <p className="pt-hint">Deck order · top first</p>
              <button
                type="button"
                className="hand-button"
                disabled={!canShuffle}
                onClick={shuffleMainDeck}
                aria-label="Shuffle inspected deck"
              >
                <Shuffle size={13} />
                Shuffle
              </button>
            </div>
          )}
          {(inspected === "deck" ||
            (session?.zones[inspected].length ?? 0) > 8) && (
            <input
              className="workspace-control"
              aria-label={
                inspected === "deck" ? "Search deck" : "Search inspected zone"
              }
              placeholder="Find a card…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <div
            className={`pt-zone-list ${dropClass(inspected)}`}
            data-drop-zone={inspected}
            data-drag-scroll
            role="group"
            aria-label={`${ZONES[inspected]} cards`}
          >
            {inspectedCards.length ? (
              inspectedCards.map((card, index) => cardButton(card, index, true))
            ) : (
              <span className="pt-zone-empty">
                {query ? "No matches" : "Empty"}
              </span>
            )}
          </div>
          {focusedEntry?.card && (
            <div className="pt-card-detail">
              <strong>{focusedEntry.card.name}</strong>
              <span>
                G{focusedEntry.card.grade ?? "?"} ·{" "}
                {focusedEntry.card.power?.toLocaleString() ?? "—"} ·{" "}
                {ZONES[focused!.zone]}
              </span>
              {Boolean(focused!.card.power || focused!.card.critical) && (
                <span>
                  Bonus: {focused!.card.power >= 0 ? "+" : ""}
                  {focused!.card.power.toLocaleString()} /{" "}
                  {focused!.card.critical >= 0 ? "+" : ""}
                  {focused!.card.critical}★
                </span>
              )}
              <CardAbilityText text={focusedEntry.card.skill_text} />
            </div>
          )}
        </aside>
      </div>
      {selected.length > 0 && !setup && (
        <SelectedCardActions
          selectedCount={selected.length}
          playing={playing}
          destination={destination}
          onClear={() => setSelected([])}
          onDestinationChange={setDestination}
          onMove={move}
          onChangeCards={(change) =>
            apply(changeCards(session!, selected, change), false)
          }
        />
      )}
      <div className="pt-footer">
        <span>Manual effects & costs · temporary session</span>
        {session && (
          <details>
            <summary>Activity</summary>
            <ol>
              {session.log.map((line, index) => (
                <li key={`${index}:${line}`}>{line}</li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {drag && <CardDragPreview drag={drag} entry={dragEntry} />}
    </section>
  );
}
