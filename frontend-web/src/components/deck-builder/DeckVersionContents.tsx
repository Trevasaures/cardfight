import { AlertTriangle, CheckCircle2, Layers3, Trash2 } from "lucide-react";
import { CardArtwork } from "../cards/CardArtwork";
import { cardGradeBadge, isCrestCard } from "../../utils/cards";
import { useRememberedScroll } from "../../hooks/useRememberedScroll";
import type { DeckCardEntry, DeckCardZone, DeckVersion } from "../../types/api";

const ZONES: { value: DeckCardZone; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "ride", label: "Ride" },
  { value: "g", label: "G zone" },
  { value: "crest", label: "Crests" },
  { value: "token", label: "Tokens" },
  { value: "other", label: "Other" },
];

const ZONE_GRADE_SORT: Record<DeckCardZone, "asc" | "desc"> = {
  main: "desc",
  ride: "asc",
  g: "desc",
  crest: "asc",
  token: "asc",
  other: "desc",
};

type Props = {
  currentVersion: DeckVersion | null;
  groupedCards: Map<DeckCardZone, DeckCardEntry[]>;
  activeZone: DeckCardZone;
  onActiveZoneChange: (zone: DeckCardZone) => void;
  saving: boolean;
  onQuantityChange: (entry: DeckCardEntry, quantity: number) => void;
  onPrintingChange: (entry: DeckCardEntry, printing: string) => void;
  onRemoveCard: (entry: DeckCardEntry) => void;
  onInspectCard: (entry: DeckCardEntry) => void;
};

type GradeGroup = {
  gradeKey: string;
  label: string;
  total: number;
  entries: DeckCardEntry[];
};

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

    const nameSort = cardName(first).localeCompare(
      cardName(second),
      undefined,
      {
        sensitivity: "base",
        numeric: true,
      },
    );

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
    const isCrest = isCrestCard(entry.card);
    const gradeKey = isCrest
      ? "crest"
      : grade === null
        ? "unknown"
        : String(grade);
    const existing = groups.find((group) => group.gradeKey === gradeKey);

    if (existing) {
      existing.entries.push(entry);
      existing.total += entry.quantity;
      continue;
    }

    groups.push({
      gradeKey,
      label: isCrest ? "Crests" : gradeLabel(grade),
      total: entry.quantity,
      entries: [entry],
    });
  }

  return groups;
}

export function DeckVersionContents({
  currentVersion,
  groupedCards,
  activeZone: zone,
  onActiveZoneChange,
  saving,
  onQuantityChange,
  onPrintingChange,
  onRemoveCard,
  onInspectCard,
}: Props) {
  const rules = currentVersion?.deck_rules;
  const entries = sortEntriesForZone(zone, groupedCards.get(zone) ?? []);
  const groups = buildGradeGroups(entries);
  const listRef = useRememberedScroll<HTMLDivElement>(
    `cardfight.scroll.builder-list:${currentVersion?.id ?? "none"}:${zone}`,
    Boolean(currentVersion),
  );

  return (
    <section
      data-anime="motion-panel"
      className="collection-panel"
      aria-label="Deck list"
    >
      <div className="collection-panel-header">
        <h2>Deck list</h2>
        {rules && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${rules.is_complete ? "text-emerald-200" : "text-cyan-200"}`}
          >
            {rules.is_complete ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            {rules.is_complete ? "Complete" : "Incomplete"}
          </span>
        )}
      </div>
      {rules && (
        <>
          <div className="builder-counts">
            {[
              ["Main", rules.main_deck_count, rules.main_deck_limit],
              ["Ride", rules.ride_deck_count, rules.ride_deck_limit],
              ["Total", rules.core_card_count, rules.required_total],
            ].map(([label, count, limit]) => (
              <div key={label}>
                <span className="collection-label">{label}</span>
                <strong>
                  {count}
                  <small> / {limit}</small>
                </strong>
              </div>
            ))}
          </div>
          {!!rules.issues.length && (
            <details className="builder-issues mt-3">
              <summary className="cursor-pointer">
                {rules.issues.length} deck{" "}
                {rules.issues.length === 1 ? "issue" : "issues"}
              </summary>
              <ul className="mt-2 space-y-1">
                {rules.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <div
        className="collection-segments border-b border-white/10 p-3"
        role="group"
        aria-label="Deck zones"
      >
        {ZONES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onActiveZoneChange(item.value)}
            aria-pressed={zone === item.value}
          >
            {item.label}
            <span>{currentVersion?.totals_by_zone[item.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div ref={listRef} className="builder-zone-list">
        {groups.map((group) => (
          <section
            key={group.gradeKey}
            aria-label={group.label}
            data-builder-anime="zone"
          >
            <h3 className="builder-zone-heading">
              {group.label}
              <span>
                {group.total} {group.total === 1 ? "copy" : "copies"}
              </span>
            </h3>
            {group.entries.map((entry) => (
              <article
                key={entry.id}
                data-builder-anime="deck-entry"
                className="builder-entry"
                aria-label={cardName(entry)}
              >
                {entry.card && (
                  <div className="collection-artwork">
                    <CardArtwork card={entry.card} printing={entry.printing} />
                    <span className="collection-grade">
                      {cardGradeBadge(entry.card)}
                    </span>
                  </div>
                )}
                <div className="builder-entry-main">
                  <button
                    type="button"
                    className="builder-card-name text-left hover:underline"
                    title={cardName(entry)}
                    aria-haspopup="dialog"
                    onClick={() => onInspectCard(entry)}
                  >
                    {cardName(entry)}
                  </button>
                  <select
                    value={entry.printing_id ?? ""}
                    onChange={(event) =>
                      onPrintingChange(entry, event.target.value)
                    }
                    disabled={saving}
                    aria-label={`Printing for ${cardName(entry)}`}
                  >
                    <option value="">No printing selected</option>
                    {entry.card?.printings.map((printing) => (
                      <option key={printing.id} value={printing.id}>
                        {[
                          printing.set_code,
                          printing.card_number,
                          printing.rarity,
                        ]
                          .filter(Boolean)
                          .join(" · ") || `Printing ${printing.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="builder-quantity">
                  {!isCrestCard(entry.card) && (
                    <button
                      type="button"
                      disabled={saving || entry.quantity <= 1}
                      onClick={() =>
                        onQuantityChange(entry, entry.quantity - 1)
                      }
                      aria-label={`Decrease ${cardName(entry)} quantity`}
                    >
                      −
                    </button>
                  )}
                  <span>{entry.quantity}</span>
                  {!isCrestCard(entry.card) && (
                    <button
                      type="button"
                      disabled={
                        saving ||
                        entry.zone === "ride" ||
                        (entry.zone === "main" &&
                          !!rules &&
                          rules.main_deck_count >= rules.main_deck_limit)
                      }
                      onClick={() =>
                        onQuantityChange(entry, entry.quantity + 1)
                      }
                      aria-label={`Increase ${cardName(entry)} quantity`}
                    >
                      +
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onRemoveCard(entry)}
                  className="collection-button subtle danger"
                  aria-label={`Remove ${cardName(entry)}`}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
          </section>
        ))}
        {!groups.length && (
          <div className="collection-empty">
            <Layers3 size={26} />
            <p>
              {currentVersion
                ? zone === "crest"
                  ? "Add a crest from the catalog."
                  : "No cards in this zone."
                : "Select or create a version."}
            </p>
          </div>
        )}
      </div>
      {currentVersion && (
        <div className="collection-muted border-t border-white/10 px-4 py-3">
          {currentVersion.unique_card_count} unique cards ·{" "}
          {currentVersion.version_name}
        </div>
      )}
    </section>
  );
}
