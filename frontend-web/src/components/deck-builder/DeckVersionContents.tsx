import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";

import type {
  Card,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
} from "../../types/api";

const ZONES: { value: DeckCardZone; label: string }[] = [
  { value: "main", label: "Main deck" },
  { value: "ride", label: "Ride deck" },
  { value: "g", label: "G zone" },
  { value: "token", label: "Token" },
  { value: "other", label: "Other" },
];

const ZONE_GRADE_SORT: Record<DeckCardZone, "asc" | "desc"> = {
  main: "desc",
  ride: "asc",
  g: "desc",
  token: "asc",
  other: "desc",
};

type DeckVersionContentsProps = {
  currentVersion: DeckVersion | null;
  groupedCards: Map<DeckCardZone, DeckCardEntry[]>;
  cardResults: Card[];
  selectedCardId: string;
  addQuantity: number;
  addZone: DeckCardZone;
  saving: boolean;
  selectedCard: Card | null;
  onSelectedCardIdChange: (value: string) => void;
  onAddQuantityChange: (value: number) => void;
  onAddZoneChange: (value: DeckCardZone) => void;
  onAddCardToVersion: () => void;
  onQuantityChange: (entry: DeckCardEntry, nextQuantity: number) => void;
  onRemoveCard: (entry: DeckCardEntry) => void;
};

type GradeGroup = {
  gradeKey: string;
  label: string;
  total: number;
  entries: DeckCardEntry[];
};

function cardMeta(card: Card | null) {
  if (!card) return "Unknown card";

  const chunks = [
    card.grade !== null ? `Grade ${card.grade}` : null,
    card.nation,
    card.card_type,
  ].filter(Boolean);

  return chunks.join(" · ") || "No card metadata";
}

function printingLabel(entry: DeckCardEntry) {
  if (!entry.printing) return "No printing selected";

  return [
    entry.printing.set_code,
    entry.printing.card_number,
    entry.printing.rarity,
  ]
    .filter(Boolean)
    .join(" · ");
}

function cardName(entry: DeckCardEntry) {
  return entry.card?.name ?? "Unknown card";
}

function cardGrade(entry: DeckCardEntry) {
  return entry.card?.grade ?? null;
}

function gradeLabel(grade: number | null) {
  return grade === null ? "Unknown grade" : `Grade ${grade}`;
}

function compareEntriesForZone(zone: DeckCardZone) {
  const gradeDirection = ZONE_GRADE_SORT[zone];

  return (first: DeckCardEntry, second: DeckCardEntry) => {
    const firstGrade = cardGrade(first);
    const secondGrade = cardGrade(second);

    if (firstGrade === null && secondGrade !== null) return 1;
    if (firstGrade !== null && secondGrade === null) return -1;

    if (
      firstGrade !== null &&
      secondGrade !== null &&
      firstGrade !== secondGrade
    ) {
      return gradeDirection === "asc"
        ? firstGrade - secondGrade
        : secondGrade - firstGrade;
    }

    const nameSort = cardName(first).localeCompare(cardName(second), undefined, {
      sensitivity: "base",
      numeric: true,
    });

    if (nameSort !== 0) return nameSort;

    const printingSort = printingLabel(first).localeCompare(
      printingLabel(second),
      undefined,
      {
        sensitivity: "base",
        numeric: true,
      },
    );

    if (printingSort !== 0) return printingSort;

    return first.id - second.id;
  };
}

function sortEntriesForZone(zone: DeckCardZone, entries: DeckCardEntry[]) {
  return [...entries].sort(compareEntriesForZone(zone));
}

function buildGradeGroups(entries: DeckCardEntry[]) {
  const groups: GradeGroup[] = [];

  for (const entry of entries) {
    const grade = cardGrade(entry);
    const gradeKey = grade === null ? "unknown" : String(grade);
    const existing = groups.find((group) => group.gradeKey === gradeKey);

    if (existing) {
      existing.entries.push(entry);
      existing.total += entry.quantity;
      continue;
    }

    groups.push({
      gradeKey,
      label: gradeLabel(grade),
      total: entry.quantity,
      entries: [entry],
    });
  }

  return groups;
}

function gradeSummary(entries: DeckCardEntry[]) {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const label = gradeLabel(cardGrade(entry));
    totals.set(label, (totals.get(label) ?? 0) + entry.quantity);
  }

  return Array.from(totals.entries())
    .map(([label, total]) => `${label}: ${total}`)
    .join(" · ");
}

export function DeckVersionContents({
  currentVersion,
  groupedCards,
  cardResults,
  selectedCardId,
  addQuantity,
  addZone,
  saving,
  selectedCard,
  onSelectedCardIdChange,
  onAddQuantityChange,
  onAddZoneChange,
  onAddCardToVersion,
  onQuantityChange,
  onRemoveCard,
}: DeckVersionContentsProps) {
  const rules = currentVersion?.deck_rules ?? null;
  const selectedGrade = selectedCard?.grade ?? null;
  const rideEntries = groupedCards.get("ride") ?? [];
  const rideHasSelectedGrade = rideEntries.some(
    (entry) => entry.card?.grade === selectedGrade,
  );

  let addRuleIssue: string | null = null;
  if (
    rules &&
    selectedCard &&
    (selectedGrade === null || selectedGrade < 0 || selectedGrade > 4)
  ) {
    addRuleIssue = "Deck cards must have a grade between 0 and 4.";
  }

  if (!addRuleIssue && rules && selectedCard && addZone === "main") {
    if (rules.main_deck_count + addQuantity > rules.main_deck_limit) {
      addRuleIssue = `Only ${rules.main_deck_limit - rules.main_deck_count} main-deck slots remain.`;
    }
  }

  if (!addRuleIssue && rules && selectedCard && addZone === "ride") {
    if (selectedGrade === null || selectedGrade < 0 || selectedGrade > 3) {
      addRuleIssue = "The ride deck only accepts grade 0, 1, 2, or 3 cards.";
    } else if (rideHasSelectedGrade) {
      addRuleIssue = `The ride deck already has a grade ${selectedGrade} card.`;
    } else if (rules.ride_deck_count >= rules.ride_deck_limit) {
      addRuleIssue = "The ride deck already has four cards.";
    }
  }

  return (
    <section
      data-anime="motion-panel"
      className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Step 3
          </p>
          <h3 className="mt-1 text-2xl font-black text-slate-50">
            {"Deck Build" +
              (currentVersion?.version_name
                ? ` - ${currentVersion.version_name}`
                : "")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Add selected cards into a zone. Cards are displayed by grade, then
            alphabetically inside each grade.
          </p>
        </div>

        {rules ? (
          <div
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black ${
              rules.is_complete
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-amber-300/20 bg-amber-300/10 text-amber-100"
            }`}
          >
            {rules.is_complete ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {rules.is_complete ? "Deck complete" : "Deck needs work"}
          </div>
        ) : null}
      </div>

      {rules ? (
        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Main deck",
                value: rules.main_deck_count,
                limit: rules.main_deck_limit,
              },
              {
                label: "Ride deck",
                value: rules.ride_deck_count,
                limit: rules.ride_deck_limit,
              },
              {
                label: "Core total",
                value: rules.core_card_count,
                limit: rules.required_total,
              },
            ].map((item) => {
              const complete = item.value === item.limit;

              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      {item.label}
                    </p>
                    {complete ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-2xl font-black text-slate-50">
                    {item.value}
                    <span className="text-base text-slate-500">
                      /{item.limit}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>

          {!rules.is_complete && rules.issues.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {rules.issues.map((issue) => (
                <span
                  key={issue}
                  className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-3 py-1 text-xs font-bold text-amber-100/80"
                >
                  {issue}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_6rem_10rem]">
          <select
            value={selectedCardId}
            onChange={(event) => onSelectedCardIdChange(event.target.value)}
            title="Choose a card from the current search results to add to the selected deck version."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {cardResults.length === 0 ? (
              <option value="">No card selected</option>
            ) : null}
            {cardResults.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={1}
            max={addZone === "ride" ? 1 : undefined}
            value={addQuantity}
            onChange={(event) => onAddQuantityChange(Number(event.target.value))}
            readOnly={addZone === "ride"}
            title="Quantity of this card to add to the selected zone."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
          />

          <select
            value={addZone}
            onChange={(event) =>
              onAddZoneChange(event.target.value as DeckCardZone)
            }
            title="Choose where this card belongs in the deck list."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onAddCardToVersion}
          disabled={!currentVersion || !selectedCard || saving || Boolean(addRuleIssue)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          title={addRuleIssue ?? "Add the selected card to the current deck version"}
        >
          <Plus className="h-4 w-4" />
          Add selected card
        </button>

        {addRuleIssue ? (
          <p className="mt-2 text-center text-xs font-bold text-amber-200/80">
            {addRuleIssue}
          </p>
        ) : null}
      </div>

      <div className="mt-5 max-h-[34rem] space-y-4 overflow-auto pr-1">
        {currentVersion ? (
          ZONES.map((zone) => {
            const rawEntries = groupedCards.get(zone.value) ?? [];
            const entries = sortEntriesForZone(zone.value, rawEntries);
            const gradeGroups = buildGradeGroups(entries);
            const zoneTotal = currentVersion.totals_by_zone[zone.value] ?? 0;
            const summary = gradeSummary(entries);

            return (
              <section
                key={zone.value}
                data-builder-anime="zone"
                className="rounded-3xl border border-white/10 bg-black/10 p-4"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-black text-slate-100">{zone.label}</h4>
                    {summary ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {summary}
                      </p>
                    ) : null}
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-500">
                    {zone.value === "main"
                      ? `${zoneTotal}/50 cards`
                      : zone.value === "ride"
                        ? `${zoneTotal}/4 cards`
                        : `${zoneTotal} cards`}
                  </span>
                </div>

                {gradeGroups.length ? (
                  <div className="space-y-5">
                    {gradeGroups.map((group) => (
                      <div key={group.gradeKey}>
                        <div className="mb-2 flex items-center gap-3">
                          <p className="shrink-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                            {group.label}
                          </p>

                          <div className="h-px flex-1 bg-white/10" />

                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs font-bold text-slate-500">
                            {group.total} cards
                          </span>
                        </div>

                        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                          {group.entries.map((entry) => (
                            <article
                              key={entry.id}
                              data-builder-anime="deck-entry"
                              className="grid gap-3 px-3 py-2.5 transition hover:bg-white/[0.035] md:grid-cols-[1fr_auto] md:items-center"
                            >
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-black text-cyan-100">
                                    x{entry.quantity}
                                  </span>

                                  <p className="min-w-0 truncate font-black text-slate-50">
                                    {entry.card?.name ?? "Unknown card"}
                                  </p>
                                </div>

                                <p className="mt-1 truncate text-sm text-slate-500">
                                  {cardMeta(entry.card)}
                                </p>

                                <p className="mt-1 truncate text-xs text-slate-600">
                                  {printingLabel(entry)}
                                </p>
                              </div>

                              <div className="flex items-center justify-between gap-3 md:justify-end">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onQuantityChange(
                                        entry,
                                        entry.quantity - 1,
                                      )
                                    }
                                    disabled={entry.quantity <= 1 || saving}
                                    className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.04] text-base font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                    title="Decrease quantity"
                                  >
                                    -
                                  </button>

                                  <span className="w-8 text-center text-base font-black text-slate-50">
                                    {entry.quantity}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      onQuantityChange(
                                        entry,
                                        entry.quantity + 1,
                                      )
                                    }
                                    disabled={
                                      saving ||
                                      entry.zone === "ride" ||
                                      (entry.zone === "main" &&
                                        rules !== null &&
                                        rules.main_deck_count >=
                                          rules.main_deck_limit)
                                    }
                                    className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.04] text-base font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                    title="Increase quantity"
                                  >
                                    +
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => onRemoveCard(entry)}
                                    className="h-8 w-8 rounded-xl border border-rose-300/20 bg-rose-300/10 text-rose-100 transition hover:bg-rose-300/20"
                                    title="Remove this card from the deck version"
                                  >
                                    <Trash2 className="mx-auto h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm text-slate-600">
                    No cards in this zone yet.
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="rounded-[2rem] border border-dashed border-white/15 bg-black/20 p-10 text-center">
            <p className="text-lg font-black text-slate-300">
              No deck version selected.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Create a version for the selected deck, then start adding cards.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
