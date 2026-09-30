import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Eye,
  Layers3,
  RotateCcw,
  Shuffle,
  Swords,
  Undo2,
} from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckVersion } from "../../types/api";
import { nationColor } from "../../utils/nations";
import type { CardCopy } from "./engine";
import {
  ATTACK_CIRCLES,
  attackCard,
  beginCheck,
  canAttack,
  canDropCards,
  changeCards,
  changeEnergy,
  CIRCLES,
  findCard,
  finishMulligan,
  getDriveAttacker,
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
import { usePlaytestSession } from "./usePlaytestSession";
import { MAX_UNDO_STATES } from "./sessionStore";
import { PlaytestCard } from "./PlaytestCard";
import { PlaytestZone } from "./PlaytestZone";
import { ResourceZone } from "./ResourceZone";
import { BattleStatus } from "./BattleStatus";
import { PowerControls } from "./PowerControls";
import { applyPowerEffect } from "./powerEffects";
import { CardInspector } from "./CardInspector";
import { SelectedCardActions } from "./SelectedCardActions";
import { RuleControls } from "./rules/RuleControls";
import { applyRules, effectiveGrade, energyLimit } from "./rules";
import { CardDragPreview } from "./CardDragPreview";
import "./playtest.css";

type Props = { version: DeckVersion; copies: CardCopy[] };
const LARGE_PILES: readonly Zone[] = [
  "deck",
  "drop",
  "soul",
  "bind",
  "g",
  "reserve",
  "gauge",
];

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
  const { history, savedStarterKey, backedUp, notice, saveHistory } =
    usePlaytestSession(version, inventory.cards);
  const [first, setFirst] = useState(history.present?.first ?? true);
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
  const [starter, setStarter] = useState(
    history.present ? (savedStarterKey ?? "") : (starters[0]?.key ?? ""),
  );
  const [setup, setSetup] = useState(!history.present);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState<Zone>("ride");
  const [destination, setDestination] = useState<Zone | "deckTop">("drop");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const tableRef = useRef<HTMLElement>(null);
  const session = history.present;
  const ruleContext = session ? { session, entries } : null;
  const energyMax = ruleContext ? energyLimit(ruleContext) : 10;
  const playing = Boolean(session && session.phase !== "mulligan");
  const selection = session
    ? selected.flatMap((key) => {
        const found = findCard(session, key);
        return found ? [found] : [];
      })
    : [];
  const focused = selection.at(-1);
  const focusedEntry = focused && entries.get(focused.card.entryId);
  const selectedAttacker =
    selection.length === 1 && focused && ATTACK_CIRCLES.includes(focused.zone)
      ? focused.card
      : undefined;
  const driveAttacker =
    session && getDriveAttacker(session, selectedAttacker?.key);
  const driveAttackerName =
    driveAttacker && entries.get(driveAttacker.card.entryId)?.card?.name;
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
    next = applyRules(session, next, entries);
    // Store full snapshots so undo restores deck order, checks, and temporary bonuses.
    // Keep at most 80 previous states; repeated no-op actions do not consume history.
    saveHistory({
      past: [...history.past.slice(-(MAX_UNDO_STATES - 1)), session],
      present: next,
    });
    if (clear) setSelected([]);
    setAnnouncement(next.log.at(-1) ?? "Table updated.");
  }

  function newGame() {
    try {
      const next = startTable(version.cards, first, starter || null);
      saveHistory({ past: [], present: next }, starter || null);
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
    saveHistory({ past: history.past.slice(0, -1), present: previous });
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

  function restUnit(card: TableCard) {
    if (!session || !playing || setup || drag) return;
    const found = findCard(session, card.key);
    if (!found || !CIRCLES.includes(found.zone)) return;
    // Double-click targets only this copy, even when several cards were selected.
    apply(changeCards(session, [card.key], "rest"), false);
    setSelected([card.key]);
    setAnnouncement(
      `${entries.get(card.entryId)?.card?.name ?? "Unit"} ${card.rested ? "stood" : "rested"}.`,
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

  function attackSelectedCard() {
    if (!session || !selectedAttacker) return;
    apply(attackCard(session, selectedAttacker.key), false);
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
        soul={zone === "vanguard" ? session?.zones.soul : undefined}
        soulDropClassName={zone === "vanguard" ? dropClass("soul") : undefined}
        onOpen={openZone}
        onRest={restUnit}
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
        effectiveGrade={
          ruleContext
            ? effectiveGrade(ruleContext, card, compact ? inspected : "hand")
            : undefined
        }
        compact={compact}
        selected={selected.includes(card.key)}
        draggable={playing && !setup}
        dragging={Boolean(drag?.keys.includes(card.key))}
        disabled={!playing && inspected !== "hand" && compact}
        onSelect={selectCard}
        onRest={
          compact && CIRCLES.includes(inspected) && playing && !setup
            ? restUnit
            : undefined
        }
        onDragStart={(event, card) =>
          start(event, dragKeys(card), card.faceDown)
        }
      />
    );
  }

  function resourceZone(zone: "damage" | "soul") {
    return (
      <ResourceZone
        zone={zone}
        cards={session?.zones[zone] ?? []}
        entries={entries}
        selected={selected}
        draggedKeys={drag?.keys ?? []}
        playing={playing && !setup}
        canCharge={drawable && !setup}
        dropClassName={dropClass(zone)}
        onOpen={openZone}
        onSelect={(card) => {
          setInspected(zone);
          setQuery("");
          selectCard(card);
        }}
        onUse={(card) => {
          if (!session || !playing || setup) return;
          // These shortcuts target one physical copy, regardless of the current selection.
          if (zone === "damage") {
            apply(changeCards(session, [card.key], "flip"), false);
            setAnnouncement(
              card.faceDown ? "Counter charged 1." : "Counter blasted 1.",
            );
          } else {
            apply(moveCards(session, [card.key], "drop"));
            setAnnouncement("Soul blasted 1.");
          }
        }}
        onCharge={() => {
          if (!session || !drawable || setup) return;
          apply(takeTop(session, "soul"));
          setInspected("soul");
          setQuery("");
        }}
        onDragStart={(event, card) =>
          start(event, dragKeys(card), card.faceDown)
        }
      />
    );
  }

  const nextLabel = getNextPhaseLabel(session);
  const zoneCards = session?.zones[inspected] ?? [];
  // Show the card immediately beneath the vanguard first in the soul browser.
  const orderedCards =
    inspected === "soul" ? [...zoneCards].reverse() : zoneCards;
  const inspectedCards = orderedCards.filter((card) =>
    (entries.get(card.entryId)?.card?.name ?? "")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const inspectingUnit = CIRCLES.includes(inspected);
  const selectedCardDetails = focused && focusedEntry?.card && (
    <CardInspector
      card={focused.card}
      entry={focusedEntry}
      zone={focused.zone}
      effectiveGrade={
        ruleContext
          ? effectiveGrade(ruleContext, focused.card, focused.zone)
          : undefined
      }
    />
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
      {notice && (
        <p className="hand-practice-notice" role="status">
          {notice}
        </p>
      )}
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
        <>
          <BattleStatus
            session={session!}
            disabled={setup}
            energyMax={energyMax}
            nextLabel={nextLabel}
            onAdvance={() => apply(nextPhase(session!))}
            onInspect={openZone}
            onEnergy={(delta) => apply(changeEnergy(session!, delta, energyMax), false)}
          />
          <RuleControls
            context={ruleContext!}
            disabled={setup}
            onApply={(next) => apply(next, false)}
            onInspect={openZone}
          />
          <PowerControls
            session={session!}
            selected={selected}
            disabled={setup}
            onApply={(effect) =>
              apply(applyPowerEffect(session!, selected, effect), false)
            }
          />
        </>
      )}
      <div
        className={`pt-layout ${setup && session ? "is-paused" : ""}`}
        inert={setup && session ? true : undefined}
      >
        <div className="pt-board-column">
          {session?.check && (
            <div className="pt-check" role="status">
              {checkEntry?.card && (
                <CardArtwork
                  card={checkEntry.card}
                  printing={checkEntry.printing}
                />
              )}
              <span className="pt-check-info">
                <small>
                  {session.check.kind === "drive"
                    ? "Drive check"
                    : "Damage check"}
                </small>
                <strong>{checkEntry?.card?.name}</strong>
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
          <div
            className="pt-board-scroll"
            data-drag-scroll
            tabIndex={0}
            role="region"
            aria-label="Playmat"
          >
            <div className="pt-mat">
              {resourceZone("damage")}
              <div className="pt-field">
                {zoneButton("guardian")}
                {CIRCLES.map(zoneButton)}
              </div>
              <div className="pt-side">
                {(["ride", "deck", "drop", "reveal"] as Zone[]).map(zoneButton)}
              </div>
              {resourceZone("soul")}
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
                  !driveAttacker ||
                  Boolean(session?.check) ||
                  Boolean(session?.rules.pending.length) ||
                  session?.active !== "you" ||
                  session?.phase !== "battle"
                }
                onClick={() => {
                  apply(beginCheck(session!, "drive", driveAttacker?.card.key));
                  setInspected("reveal");
                }}
                title={
                  driveAttackerName
                    ? `Drive check · ${driveAttackerName}`
                    : "Drive check"
                }
              >
                <Swords size={14} />
                {driveAttacker && driveAttacker.zone !== "vanguard"
                  ? "Rear-guard drive"
                  : "Drive check"}
              </button>
              <button
                type="button"
                className="hand-button"
                disabled={
                  !drawable || Boolean(session?.check) ||
                  Boolean(session?.rules.pending.length)
                }
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
          </div>
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
        <aside
          className={`pt-inspector ${LARGE_PILES.includes(inspected) ? "is-browsing-pile" : ""}`}
          aria-label="Zone inspector"
        >
          {!inspectingUnit && selectedCardDetails}
          <div className="pt-inspector-browser">
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
            {inspected === "soul" && (
              <p className="pt-hint">Stack order · top first</p>
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
              key={inspected}
              className={`pt-zone-list ${dropClass(inspected)}`}
              data-drop-zone={inspected}
              data-drag-scroll
              role="group"
              aria-label={`${ZONES[inspected]} cards`}
            >
              {inspectedCards.length ? (
                inspectedCards.map((card, index) =>
                  cardButton(card, index, true),
                )
              ) : (
                <span className="pt-zone-empty">
                  {query ? "No matches" : "Empty"}
                </span>
              )}
            </div>
          </div>
          {/* Keep a unit's click target above details so it cannot move between clicks. */}
          {inspectingUnit && selectedCardDetails}
        </aside>
      </div>
      {selected.length > 0 && !setup && (
        <SelectedCardActions
          selection={selection}
          playing={playing}
          canAttack={Boolean(
            session &&
              selectedAttacker &&
              canAttack(session, selectedAttacker.key),
          )}
          onAttack={attackSelectedCard}
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
        <span>
          Manual effects & costs
          {session &&
            (backedUp ? " · Saved in this tab" : " · Saved until refresh")}
        </span>
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
