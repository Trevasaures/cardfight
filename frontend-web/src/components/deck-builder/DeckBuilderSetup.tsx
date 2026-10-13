import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { Deck, DeckVersion, DeckVersionSummary } from "../../types/api";

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
  onActivateVersion: () => void;
  onDeleteVersion: () => void;
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
  onActivateVersion,
  onDeleteVersion,
}: DeckBuilderSetupProps) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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

  useEffect(() => {
    setShowDeleteConfirmation(false);
    setDeleteConfirmation("");
  }, [currentVersion?.id]);

  return (
    <section
      data-anime="motion-panel"
      className="collection-panel builder-toolbar"
      aria-label="Deck workspace"
    >
      <div className="builder-toolbar-main">
        <label>
          <span className="collection-label">Deck</span>
          <select
            aria-label="Deck"
            value={selectedDeckId}
            onChange={(event) => onSelectedDeckIdChange(event.target.value)}
            disabled={loadingDecks || saving}
            className="workspace-control w-full"
          >
            {!decks.length && (
              <option value="">{loadingDecks ? "Loading…" : "No decks"}</option>
            )}
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="collection-label">Version</span>
          <select
            aria-label="Version"
            value={selectedVersionId}
            onChange={(event) => onSelectedVersionIdChange(event.target.value)}
            disabled={loadingVersions || saving}
            className="workspace-control w-full"
          >
            {!versions.length && (
              <option value="">
                {loadingVersions ? "Loading…" : "Create a version"}
              </option>
            )}
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.version_name}
                {version.is_active ? " · Active" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="builder-toolbar-actions">
          <button
            type="button"
            onClick={onShowCreateVersion}
            disabled={!selectedDeck || saving || showCreateVersion}
            className="collection-button"
          >
            <Copy /> New version
          </button>
          {currentVersion && (
            <Link
              to={`/hand-lab?deck=${currentVersion.deck_id}&version=${currentVersion.id}`}
              className="collection-button primary"
            >
              <Shuffle /> Hand Lab
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              onRefreshDecks();
              onRefreshVersions();
            }}
            disabled={loadingDecks || loadingVersions || saving}
            className="collection-button subtle"
            aria-label="Refresh deck workspace"
          >
            <RefreshCcw />
          </button>
        </div>
      </div>
      <div className="builder-context">
        {nationIcons.map((icon) => (
          <img key={icon.path} src={icon.path} alt={icon.nation} />
        ))}
        <span>{nationLabel}</span>
        {selectedDeck && <FormatBadge type={selectedDeck.type} />}
        <div className="builder-toolbar-actions">
          {currentVersion && (
            <>
              {currentVersion.is_active ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-200">
                  <CheckCircle2 size={13} /> Active
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onActivateVersion}
                  disabled={saving}
                  className="collection-button subtle"
                >
                  <CheckCircle2 /> Make active
                </button>
              )}
              <button
                type="button"
                onClick={onShowEditVersion}
                disabled={showEditVersion || saving}
                className="collection-button subtle"
              >
                <Pencil /> Details
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                disabled={saving || currentVersion.is_active}
                className="collection-button subtle danger"
                aria-label="Delete version"
                title={
                  currentVersion.is_active
                    ? "Make another version active before deleting"
                    : "Delete version"
                }
              >
                <Trash2 />
              </button>
            </>
          )}
        </div>
      </div>
      {showDeleteConfirmation && currentVersion ? (
        <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-300/[0.06] p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
            <div className="min-w-0 flex-1">
              <p className="font-black text-rose-100">
                Permanently delete {currentVersion.version_name}?
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Its saved card list will be removed. Type the exact version name
                to confirm. Active versions cannot be deleted.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={deleteConfirmation}
                  onChange={(event) =>
                    setDeleteConfirmation(event.target.value)
                  }
                  placeholder={currentVersion.version_name}
                  className="min-w-0 flex-1 rounded-xl border border-rose-300/20 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-rose-300/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    onDeleteVersion();
                    setShowDeleteConfirmation(false);
                    setDeleteConfirmation("");
                  }}
                  disabled={
                    saving || deleteConfirmation !== currentVersion.version_name
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirmation(false);
                    setDeleteConfirmation("");
                  }}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEditVersion && currentVersion ? (
        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-cyan-200/70">
                Edit version
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

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <FormTextInput
              label="Version name"
              value={editVersionName}
              onChange={onEditVersionNameChange}
              placeholder="Version name"
              required
            />

            <FormTextInput
              label="Version notes"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              title="Save the selected version name and notes"
            >
              <Save className="h-4 w-4" />
              Save changes
            </button>
          </div>
        </div>
      ) : null}

      {createVersionIsVisible ? (
        <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Plus className="h-4 w-4 shrink-0 text-violet-200" />
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-violet-200/80">
                  New version
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

          <div
            className={
              versions.length
                ? "mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.15fr)_minmax(12rem,0.9fr)_auto] 2xl:items-end"
                : "mt-3 grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.2fr)_auto] lg:items-end"
            }
          >
            <FormTextInput
              label="Name"
              value={newVersionName}
              onChange={onNewVersionNameChange}
              placeholder="Version name"
              required
            />

            <FormTextInput
              label="Notes"
              value={newVersionNotes}
              onChange={onNewVersionNotesChange}
              placeholder="What is this build for?"
            />

            {versions.length ? (
              <FormSelect
                label="Start from"
                help="Copies the full list; the source stays unchanged."
                value={newVersionSourceId}
                onChange={onNewVersionSourceIdChange}
                placeholder="An empty deck list"
                options={versions.map((version) => ({
                  value: String(version.id),
                  label: `Copy ${version.version_name}`,
                }))}
              />
            ) : null}

            <button
              type="button"
              onClick={onCreateVersion}
              disabled={!selectedDeck || saving || !newVersionName.trim()}
              className="inline-flex items-center justify-center gap-2 self-end whitespace-nowrap rounded-xl border border-violet-300/25 bg-violet-300/15 px-4 py-3 text-sm font-bold text-violet-50 transition hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                !newVersionName.trim()
                  ? "Enter a version name before creating the build"
                  : newVersionSourceId
                    ? "Create a separate active version by copying the selected deck list"
                    : "Create a separate empty active deck version"
              }
            >
              <Plus className="h-4 w-4" />
              Create version
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
