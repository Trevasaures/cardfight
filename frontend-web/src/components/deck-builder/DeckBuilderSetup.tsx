import { Layers3, Plus, RefreshCcw } from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { FormTextInput } from "../forms/HelpfulField";
import type { Deck, DeckVersion, DeckVersionSummary } from "../../types/api";
import { formatDateTime } from "../../utils/format";

type DeckBuilderSetupProps = {
  decks: Deck[];
  versions: DeckVersionSummary[];
  currentVersion: DeckVersion | null;
  selectedDeck: Deck | null;
  selectedDeckId: string;
  selectedVersionId: string;
  newVersionName: string;
  newVersionNotes: string;
  loadingDecks: boolean;
  loadingVersions: boolean;
  saving: boolean;
  onSelectedDeckIdChange: (value: string) => void;
  onSelectedVersionIdChange: (value: string) => void;
  onNewVersionNameChange: (value: string) => void;
  onNewVersionNotesChange: (value: string) => void;
  onRefreshDecks: () => void;
  onRefreshVersions: () => void;
  onCreateVersion: () => void;
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
  loadingDecks,
  loadingVersions,
  saving,
  onSelectedDeckIdChange,
  onSelectedVersionIdChange,
  onNewVersionNameChange,
  onNewVersionNotesChange,
  onRefreshDecks,
  onRefreshVersions,
  onCreateVersion,
}: DeckBuilderSetupProps) {
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
          <h3 className="mt-2 text-2xl font-black text-slate-50">
            Choose a deck and version
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Pick the deck you want to build, then create or select the specific
            version of that deck list you are editing.
          </p>
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Deck
          </p>

          <select
            value={selectedDeckId}
            onChange={(event) => onSelectedDeckIdChange(event.target.value)}
            title="Choose which saved deck you want to build or version."
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
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

          {selectedDeck ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-lg font-black text-slate-50">
                    {selectedDeck.name}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedDeck.nation ?? "No nation selected"}
                  </p>
                </div>

                <FormatBadge type={selectedDeck.type} />
              </div>

              <p className="mt-3 text-sm text-slate-400">
                {selectedDeck.wins}-{selectedDeck.losses} record ·{" "}
                {selectedDeck.decided_games} decided games
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
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

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <FormTextInput
              label="Version name"
              help="A label for this deck list version, such as Version 1, Post Set 5, or Testing Build."
              value={newVersionName}
              onChange={onNewVersionNameChange}
              placeholder="Version name"
            />

            <FormTextInput
              label="Version notes"
              help="Optional notes explaining what changed in this version or what you are testing."
              value={newVersionNotes}
              onChange={onNewVersionNotesChange}
              placeholder="Version notes"
            />

            <button
              type="button"
              onClick={onCreateVersion}
              disabled={!selectedDeck || saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              title="Create a new active deck version for the selected deck"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>

          {currentVersion ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div
                data-builder-anime="stat"
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
              >
                <p className="text-xs text-slate-500">Total cards</p>
                <p className="mt-1 text-2xl font-black text-slate-50">
                  {currentVersion.card_count}
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
          ) : null}
        </div>
      </div>
    </section>
  );
}