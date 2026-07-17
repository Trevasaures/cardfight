import {
  ArrowRight,
  ChevronDown,
  GitCompareArrows,
  Minus,
  Plus,
} from "lucide-react";

import type {
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
  DeckVersionSummary,
} from "../../types/api";

const ZONE_LABELS: Record<DeckCardZone, string> = {
  main: "Main",
  ride: "Ride",
  g: "G zone",
  token: "Token",
  other: "Other",
};

const ZONE_ORDER: DeckCardZone[] = ["main", "ride", "g", "token", "other"];

type AggregatedCard = {
  cardId: number;
  name: string;
  grade: number | null;
  quantity: number;
  zones: Partial<Record<DeckCardZone, number>>;
  printings: Set<string>;
};

type VersionChange = {
  cardId: number;
  name: string;
  grade: number | null;
  kind: "added" | "removed" | "changed";
  quantityDelta: number;
  baseline: AggregatedCard | null;
  current: AggregatedCard | null;
  zoneChanged: boolean;
  printingChanged: boolean;
};

type DeckVersionComparisonProps = {
  versions: DeckVersionSummary[];
  currentVersion: DeckVersion | null;
  baselineVersion: DeckVersion | null;
  selectedBaselineId: string;
  loading: boolean;
  onSelectedBaselineIdChange: (value: string) => void;
};

function printingIdentity(entry: DeckCardEntry) {
  const printing = entry.printing;
  if (!printing) return "No printing";

  return [printing.set_code, printing.card_number, printing.rarity]
    .filter(Boolean)
    .join(" · ") || "No printing";
}

function aggregateCards(version: DeckVersion) {
  const cards = new Map<number, AggregatedCard>();

  for (const entry of version.cards) {
    const existing = cards.get(entry.card_id);

    if (existing) {
      existing.quantity += entry.quantity;
      existing.zones[entry.zone] =
        (existing.zones[entry.zone] ?? 0) + entry.quantity;
      existing.printings.add(printingIdentity(entry));
      continue;
    }

    cards.set(entry.card_id, {
      cardId: entry.card_id,
      name: entry.card?.name ?? "Unknown card",
      grade: entry.card?.grade ?? null,
      quantity: entry.quantity,
      zones: { [entry.zone]: entry.quantity },
      printings: new Set([printingIdentity(entry)]),
    });
  }

  return cards;
}

function zoneSignature(card: AggregatedCard) {
  return ZONE_ORDER.map((zone) => `${zone}:${card.zones[zone] ?? 0}`).join("|");
}

function printingSignature(card: AggregatedCard) {
  return [...card.printings].sort().join("|");
}

function compareVersions(
  baselineVersion: DeckVersion,
  currentVersion: DeckVersion,
) {
  const baselineCards = aggregateCards(baselineVersion);
  const currentCards = aggregateCards(currentVersion);
  const cardIds = new Set([...baselineCards.keys(), ...currentCards.keys()]);
  const changes: VersionChange[] = [];

  for (const cardId of cardIds) {
    const baseline = baselineCards.get(cardId) ?? null;
    const current = currentCards.get(cardId) ?? null;

    if (!baseline && current) {
      changes.push({
        cardId,
        name: current.name,
        grade: current.grade,
        kind: "added",
        quantityDelta: current.quantity,
        baseline,
        current,
        zoneChanged: false,
        printingChanged: false,
      });
      continue;
    }

    if (baseline && !current) {
      changes.push({
        cardId,
        name: baseline.name,
        grade: baseline.grade,
        kind: "removed",
        quantityDelta: -baseline.quantity,
        baseline,
        current,
        zoneChanged: false,
        printingChanged: false,
      });
      continue;
    }

    if (!baseline || !current) continue;

    const zoneChanged = zoneSignature(baseline) !== zoneSignature(current);
    const printingChanged =
      printingSignature(baseline) !== printingSignature(current);
    const quantityDelta = current.quantity - baseline.quantity;

    if (quantityDelta !== 0 || zoneChanged || printingChanged) {
      changes.push({
        cardId,
        name: current.name,
        grade: current.grade,
        kind: "changed",
        quantityDelta,
        baseline,
        current,
        zoneChanged,
        printingChanged,
      });
    }
  }

  const kindOrder: Record<VersionChange["kind"], number> = {
    added: 0,
    removed: 1,
    changed: 2,
  };

  return changes.sort(
    (first, second) =>
      kindOrder[first.kind] - kindOrder[second.kind] ||
      first.name.localeCompare(second.name, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
  );
}

function compositionLabel(card: AggregatedCard | null) {
  if (!card) return "Not included";

  return ZONE_ORDER.filter((zone) => (card.zones[zone] ?? 0) > 0)
    .map((zone) => `${card.zones[zone]}× ${ZONE_LABELS[zone]}`)
    .join(" · ");
}

function mainDeckGrades(version: DeckVersion) {
  const totals = new Map<number, number>();

  for (const entry of version.cards) {
    if (entry.zone !== "main" || entry.card?.grade === null || !entry.card) {
      continue;
    }

    totals.set(
      entry.card.grade,
      (totals.get(entry.card.grade) ?? 0) + entry.quantity,
    );
  }

  return totals;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function changeBadge(change: VersionChange) {
  if (change.kind === "added") {
    return {
      label: "Added",
      className: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    };
  }

  if (change.kind === "removed") {
    return {
      label: "Removed",
      className: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    };
  }

  return {
    label: "Adjusted",
    className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  };
}

export function DeckVersionComparison({
  versions,
  currentVersion,
  baselineVersion,
  selectedBaselineId,
  loading,
  onSelectedBaselineIdChange,
}: DeckVersionComparisonProps) {
  const availableBaselines = versions.filter(
    (version) => version.id !== currentVersion?.id,
  );

  if (!currentVersion || availableBaselines.length === 0) return null;

  const changes = baselineVersion
    ? compareVersions(baselineVersion, currentVersion)
    : [];
  const copiesAdded = changes.reduce(
    (total, change) => total + Math.max(change.quantityDelta, 0),
    0,
  );
  const copiesRemoved = changes.reduce(
    (total, change) => total + Math.max(-change.quantityDelta, 0),
    0,
  );
  const coreDelta = baselineVersion
    ? currentVersion.deck_rules.core_card_count -
      baselineVersion.deck_rules.core_card_count
    : 0;

  const baselineGrades = baselineVersion
    ? mainDeckGrades(baselineVersion)
    : new Map<number, number>();
  const currentGrades = mainDeckGrades(currentVersion);
  const gradeRows = [0, 1, 2, 3, 4].map((grade) => ({
    grade,
    baseline: baselineGrades.get(grade) ?? 0,
    current: currentGrades.get(grade) ?? 0,
  }));
  const maxGradeTotal = Math.max(
    1,
    ...gradeRows.flatMap((row) => [row.baseline, row.current]),
  );

  return (
    <details
      data-anime="motion-panel"
      className="group rounded-[2rem] border border-white/10 bg-white/[0.04]"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
            Optional analysis
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-50">
            Compare deck versions
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Open Version Lab to inspect card, quantity, printing, and grade-curve changes.
          </p>
        </div>

        <div className="flex items-center gap-2 text-violet-100">
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.07] p-3">
            <GitCompareArrows className="h-5 w-5" />
          </div>
          <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-white/10 p-5 pt-0">

      {availableBaselines.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-black/20 p-6 text-center">
          <p className="font-black text-slate-300">
            Create a second version to unlock comparisons.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Copy this build, make a few changes, then return here to see the
            exact difference.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Baseline version
              </p>
              <select
                value={selectedBaselineId}
                onChange={(event) =>
                  onSelectedBaselineIdChange(event.target.value)
                }
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-violet-300/50"
                title="Choose the deck version used as the comparison baseline"
              >
                {availableBaselines.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.version_name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="mx-auto mb-3 hidden h-5 w-5 text-slate-600 lg:block" />

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Current version
              </p>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-3 text-sm font-black text-cyan-100">
                {currentVersion.version_name}
              </div>
            </div>
          </div>

          {loading || !baselineVersion ? (
            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-8 text-center text-sm font-bold text-slate-500">
              Loading comparison…
            </div>
          ) : (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Changed cards", value: changes.length },
                    { label: "Core size", value: signed(coreDelta) },
                    { label: "Copies added", value: `+${copiesAdded}` },
                    { label: "Copies removed", value: `-${copiesRemoved}` },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      data-builder-anime="stat"
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <p className="text-xs text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-2xl font-black text-slate-50">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Main-deck grade curve
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Baseline in slate · current in cyan
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {gradeRows.map((row) => {
                      const delta = row.current - row.baseline;

                      return (
                        <div
                          key={row.grade}
                          className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-3"
                        >
                          <p className="text-xs font-black text-slate-400">
                            Grade {row.grade}
                          </p>
                          <div className="space-y-1.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                              <div
                                className="h-full rounded-full bg-slate-500/60"
                                style={{
                                  width: `${(row.baseline / maxGradeTotal) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                              <div
                                className="h-full rounded-full bg-cyan-300/80"
                                style={{
                                  width: `${(row.current / maxGradeTotal) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p
                            className={`text-right text-xs font-black ${
                              delta > 0
                                ? "text-emerald-300"
                                : delta < 0
                                  ? "text-rose-300"
                                  : "text-slate-600"
                            }`}
                          >
                            {signed(delta)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Card changes
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Quantity, zone, and printing differences
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-500">
                    {changes.length} changes
                  </span>
                </div>

                {changes.length ? (
                  <div className="mt-4 max-h-[28rem] space-y-2 overflow-auto pr-1">
                    {changes.map((change) => {
                      const badge = changeBadge(change);

                      return (
                        <article
                          key={change.cardId}
                          data-builder-anime="deck-entry"
                          className="rounded-2xl border border-white/10 bg-white/[0.025] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                                <p className="truncate font-black text-slate-100">
                                  {change.name}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                {change.grade === null
                                  ? "Unknown grade"
                                  : `Grade ${change.grade}`}
                                {change.printingChanged
                                  ? " · Printing changed"
                                  : ""}
                              </p>
                            </div>

                            {change.quantityDelta !== 0 ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
                                  change.quantityDelta > 0
                                    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                                    : "border-rose-300/20 bg-rose-300/10 text-rose-100"
                                }`}
                              >
                                {change.quantityDelta > 0 ? (
                                  <Plus className="h-3 w-3" />
                                ) : (
                                  <Minus className="h-3 w-3" />
                                )}
                                {Math.abs(change.quantityDelta)}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                            <div className="rounded-xl bg-black/20 px-3 py-2 text-slate-500">
                              <span className="font-bold text-slate-600">
                                {baselineVersion.version_name}: {" "}
                              </span>
                              {compositionLabel(change.baseline)}
                            </div>
                            <ArrowRight className="mx-auto hidden h-3.5 w-3.5 text-slate-700 sm:block" />
                            <div className="rounded-xl bg-cyan-300/[0.05] px-3 py-2 text-cyan-100/70">
                              <span className="font-bold text-cyan-200/50">
                                {currentVersion.version_name}: {" "}
                              </span>
                              {compositionLabel(change.current)}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-emerald-300/20 bg-emerald-300/[0.05] p-6 text-center">
                    <p className="font-black text-emerald-100">
                      These versions have identical card lists.
                    </p>
                    <p className="mt-2 text-sm text-emerald-100/50">
                      Names and notes can differ without changing the deck build.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </details>
  );
}
