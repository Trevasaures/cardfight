import {
  Copy,
  Layers3,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  X,
} from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { Deck, DeckVersion, DeckVersionSummary } from "../../types/api";
import { formatDateTime, formatPercent } from "../../utils/format";

const NATION_ICON_FILES: Record<string, string> = {
  "Dragon Empire": "dragon_empire.png",
  "Dark States": "dark_states.png",
  "Brandt Gate": "brandt_gate.png",
  "Keter Sanctuary": "keter_sanctuary.png",
  Stoicheia: "stoicheia.png",
  "Lyrical Monasterio": "lyrical_monasterio.png",
};

function splitDeclaredNations(value: string | null | undefined) {
  return (value ?? "")
    .split(" / ")
    .map((nation) => nation.trim())
    .filter(Boolean);
}

type DeckBuilderSetupProps = {
  decks: Deck[];
  versions: DeckVersionSummary[];
  currentVersion: DeckVersion | null;
  selectedDeck: Deck | null;
  selectedDeckId: string;
  selectedVersionId: string;
  newVersionName: string;
  newVersionNotes: string;
  newVersionSourceId: string;
  editVersionName: string;
  editVersionNotes: string;
  versionEditIsDirty: boolean;
  showCreateVersion: boolean;
  showEditVersion: boolean;
  loadingDecks: boolean;
  loadingVersions: boolean;
  saving: boolean;
  onSelectedDeckIdChange: (value: string) => void;
  onSelectedVersionIdChange: (value: string) => void;
  onNewVersionNameChange: (value: string) => void;
  onNewVersionNotesChange: (value: string) => void;
  onNewVersionSourceIdChange: (value: string) => void;
  onEditVersionNameChange: (value: string) => void;
  onEditVersionNotesChange: (value: string) => void;
  onShowCreateVersion: () => void;
  onCancelCreateVersion: () => void;
  onShowEditVersion: () => void;
  onCancelEditVersion: () => void;
  onRefreshDecks: () => void;
  onRefreshVersions: () => void;
  onCreateVersion: () => void;
  onSaveVersionDetails: () => void;
};

export function DeckBuilderSetup({
  decks,
  versions,
  currentVersion,
  selectedDeck,
  selectedDeckId,
  selectedVersionId,
  newVersionName,
  newVersionNotes,
  newVersionSourceId,
  editVersionName,
  editVersionNotes,
  versionEditIsDirty,
  showCreateVersion,
  showEditVersion,
  loadingDecks,
  loadingVersions,
  saving,
  onSelectedDeckIdChange,
  onSelectedVersionIdChange,
  onNewVersionNameChange,
  onNewVersionNotesChange,
  onNewVersionSourceIdChange,
  onEditVersionNameChange,
  onEditVersionNotesChange,
  onShowCreateVersion,
  onCancelCreateVersion,
  onShowEditVersion,
  onCancelEditVersion,
  onRefreshDecks,
  onRefreshVersions,
  onCreateVersion,
  onSaveVersionDetails,
}: DeckBuilderSetupProps) {
  const rideLineNations = currentVersion?.deck_rules.ride_nations.length
    ? currentVersion.deck_rules.ride_nations
    : splitDeclaredNations(selectedDeck?.nation);
  const nationIcons = rideLineNations.flatMap((nation) => {
    const fileName = NATION_ICON_FILES[nation];
    return fileName ? [{ nation, path: `/nations/${fileName}` }] : [];
  });
  const nationLabel = rideLineNations.join(" / ") || "No ride line nation";
  const createVersionIsVisible =
    showCreateVersion || (!loadingVersions && versions.length === 0);

  return (
    <section
      data-anime="motion-panel"
      className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Step 1
          </p>
          <h3 className="mt-1 text-2xl font-black text-slate-50">
            Choose a deck and version
          </h3>
        </div>

        <button
          type="button"
          onClick={onRefreshDecks}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
          title="Refresh the deck list from the backend"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh decks
        </button>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1.45fr)] lg:items-stretch">
          <div className="flex">
            <select
              value={selectedDeckId}
              onChange={(event) => onSelectedDeckIdChange(event.target.value)}
              title="Choose which saved deck you want to build or version."
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
            >
              {loadingDecks ? <option value="">Loading decks...</option> : null}
              {!loadingDecks && decks.length === 0 ? (
                <option value="">No decks found</option>
              ) : null}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>

          {selectedDeck ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-center gap-4 xl:flex-nowrap">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                  {nationIcons.length ? (
                    <div className="flex -space-x-3">
                      {nationIcons.slice(0, 2).map((icon) => (
                        <img
                          key={icon.path}
                          src={icon.path}
                          alt={icon.nation}
                          className="h-11 w-11 rounded-full bg-slate-950/80 object-contain ring-2 ring-slate-900"
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xl font-black text-slate-600">?</span>
                  )}
                </div>

                <div className="min-w-[10rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-lg font-black text-slate-50">
                      {selectedDeck.name}
                    </h4>
                    <FormatBadge type={selectedDeck.type} />
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {nationLabel}
                  </p>
                </div>

                <div className="grid min-w-[18rem] flex-1 grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-black/15">
                  <div className="px-3 py-2.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-600">
                      Record
                    </p>
                    <p className="mt-1 font-black text-slate-200">
                      {selectedDeck.wins}-{selectedDeck.losses}
                    </p>
                  </div>
                  <div className="border-x border-white/10 px-3 py-2.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-600">
                      Win rate
                    </p>
                    <p className="mt-1 font-black text-slate-200">
                      {formatPercent(selectedDeck.win_pct)}
                    </p>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-600">
                      Games
                    </p>
                    <p className="mt-1 font-black text-slate-200">
                      {selectedDeck.decided_games}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3">
            <Layers3 className="h-5 w-5 text-cyan-200" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Version
              </p>
              <h4 className="font-black text-slate-100">Deck list version</h4>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <select
              value={selectedVersionId}
              onChange={(event) => onSelectedVersionIdChange(event.target.value)}
              title="Choose the version of this deck list you want to view or edit."
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
            >
              {loadingVersions ? (
                <option value="">Loading versions...</option>
              ) : null}
              {!loadingVersions && versions.length === 0 ? (
                <option value="">No versions yet</option>
              ) : null}
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version_name}
                  {version.is_active ? " · Active" : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onRefreshVersions}
              disabled={!selectedDeck}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh versions for the selected deck"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {currentVersion ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div
                  data-builder-anime="stat"
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <p className="text-xs text-slate-500">Core deck</p>
                  <p className="mt-1 text-2xl font-black text-slate-50">
                    {currentVersion.deck_rules.core_card_count}
                    <span className="text-base text-slate-500">/54</span>
                  </p>
                </div>

                <div
                  data-builder-anime="stat"
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <p className="text-xs text-slate-500">Unique cards</p>
                  <p className="mt-1 text-2xl font-black text-slate-50">
                    {currentVersion.unique_card_count}
                  </p>
                </div>

                <div
                  data-builder-anime="stat"
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <p className="text-xs text-slate-500">Updated</p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-200">
                    {formatDateTime(currentVersion.updated_at)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/70">
                    Current build
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Card changes below apply to {currentVersion.version_name}.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onShowEditVersion}
                    disabled={showEditVersion}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={onShowCreateVersion}
                    disabled={showCreateVersion}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-300/10 px-4 py-2.5 text-sm font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                    Create another version
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {showEditVersion && currentVersion ? (
            <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/70">
                    Edit current version details
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    This renames {currentVersion.version_name}; it does not create
                    a separate build.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCancelEditVersion}
                  className="rounded-xl border border-white/10 bg-black/20 p-2 text-slate-500 transition hover:text-slate-200"
                  aria-label="Close version details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <FormTextInput
                  label="Version name"
                  help="The saved label shown anywhere this deck version is selected."
                  value={editVersionName}
                  onChange={onEditVersionNameChange}
                  placeholder="Version name"
                  required
                />

                <FormTextInput
                  label="Version notes"
                  help="Optional notes describing this deck list or the changes being tested."
                  value={editVersionNotes}
                  onChange={onEditVersionNotesChange}
                  placeholder="Version notes"
                />

                <button
                  type="button"
                  onClick={onSaveVersionDetails}
                  disabled={
                    saving || !versionEditIsDirty || !editVersionName.trim()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Save the selected version name and notes"
                >
                  <Save className="h-4 w-4" />
                  Save changes
                </button>
              </div>
            </div>
          ) : null}

          {createVersionIsVisible ? (
            <div className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-300/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-xl border border-violet-300/15 bg-violet-300/10 p-2 text-violet-100">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200/80">
                      {versions.length
                        ? "New separate version"
                        : "First deck version"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {versions.length
                        ? "This creates a new active build. Your current version will remain unchanged."
                        : "Name the first build for this deck, then start with an empty list."}
                    </p>
                  </div>
                </div>

                {versions.length ? (
                  <button
                    type="button"
                    onClick={onCancelCreateVersion}
                    className="rounded-xl border border-white/10 bg-black/20 p-2 text-slate-500 transition hover:text-slate-200"
                    aria-label="Cancel new version"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <FormTextInput
                  label="New version name"
                  help="Required. Use a distinct label such as Post Set 5 or Testing Build."
                  value={newVersionName}
                  onChange={onNewVersionNameChange}
                  placeholder="Required version name"
                  required
                />

                <FormTextInput
                  label="New version notes"
                  help="Optional notes explaining what changed or what you plan to test."
                  value={newVersionNotes}
                  onChange={onNewVersionNotesChange}
                  placeholder="What is this build for?"
                />

                <FormSelect
                  label="Start from"
                  help="Start empty or copy every card, quantity, printing, zone, and sort order from an older version."
                  value={newVersionSourceId}
                  onChange={onNewVersionSourceIdChange}
                  placeholder="An empty deck list"
                  options={versions.map((version) => ({
                    value: String(version.id),
                    label: `Copy ${version.version_name}`,
                  }))}
                />

                <button
                  type="button"
                  onClick={onCreateVersion}
                  disabled={!selectedDeck || saving || !newVersionName.trim()}
                  className="inline-flex items-center justify-center gap-2 self-end rounded-2xl border border-violet-300/25 bg-violet-300/15 px-5 py-3 text-sm font-bold text-violet-50 transition hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    !newVersionName.trim()
                      ? "Enter a version name before creating the build"
                      : newVersionSourceId
                        ? "Create a separate active version by copying the selected deck list"
                        : "Create a separate empty active deck version"
                  }
                >
                  <Plus className="h-4 w-4" />
                  {newVersionSourceId
                    ? "Create copied version"
                    : "Create empty version"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
