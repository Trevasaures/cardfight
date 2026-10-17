import { useEffect, useId, useState, type FormEvent } from "react";
import { RefreshCcw, Save } from "lucide-react";

import { getDeckVersions } from "../../api/deckBuilder";
import { getDecks } from "../../api/decks";
import { updateMatch } from "../../api/matches";
import type { Deck, DeckVersionSummary, Match } from "../../types/api";
import { ModalDialog } from "../layout/ModalDialog";
import {
  changeMatchParticipant,
  createMatchEditDraft,
  isMatchEditDirty,
  matchEditPayload,
  validateMatchEdit,
  type MatchEditDraft,
} from "./match-editing";

type Props = {
  match: Match;
  onClose: () => void;
  onSaved: (match: Match) => void;
};

const fieldClass = "grid min-w-0 gap-1.5 text-xs font-semibold text-slate-400";
const controlClass = "workspace-control w-full min-w-0 text-sm font-normal";

export function MatchEditDialog({ match, onClose, onSaved }: Props) {
  const formId = useId();
  const [draft, setDraft] = useState(() => createMatchEditDraft(match));
  const [decks, setDecks] = useState<Deck[]>([]);
  const [versions, setVersions] = useState<DeckVersionSummary[][]>([[], []]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [versionError, setVersionError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingDecks(true);
    setLoadError("");
    getDecks(true)
      .then((rows) => {
        if (!cancelled) setDecks(rows);
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error ? error.message : "Could not load decks.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingDecks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    setVersionError("");
    Promise.all([
      getDeckVersions(Number(draft.deck1Id)),
      getDeckVersions(Number(draft.deck2Id)),
    ])
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          setVersions([[], []]);
          setVersionError(
            error instanceof Error
              ? error.message
              : "Could not load deck versions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.deck1Id, draft.deck2Id, retry]);

  function updateField<K extends keyof MatchEditDraft>(
    key: K,
    value: MatchEditDraft[K],
  ) {
    setSaveError("");
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function close() {
    if (saving) return;
    if (
      isMatchEditDirty(match, draft) &&
      !window.confirm("Discard unsaved match changes?")
    ) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loadingDecks || loadingVersions || loadError || versionError)
      return;
    const validationError = validateMatchEdit(draft);
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const saved = await updateMatch(match.id, matchEditPayload(match, draft));
      onSaved(saved);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this match.",
      );
      setSaving(false);
    }
  }

  const busy = loadingDecks || loadingVersions;
  const error = loadError || versionError || saveError;
  const participants = [
    {
      id: draft.deck1Id,
      name: decks.find((deck) => String(deck.id) === draft.deck1Id)?.name
        ?? match.deck1_name,
    },
    {
      id: draft.deck2Id,
      name: decks.find((deck) => String(deck.id) === draft.deck2Id)?.name
        ?? match.deck2_name,
    },
  ];

  return (
    <ModalDialog
      title="Edit match"
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="workspace-button border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="workspace-button bg-cyan-200 text-slate-950 hover:bg-cyan-100"
            disabled={saving || busy || Boolean(loadError || versionError)}
          >
            {saving ? (
              <RefreshCcw size={15} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Save size={15} />
            )}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => void submit(event)}
        className="grid gap-5"
        aria-busy={saving || busy}
      >
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200"
          >
            <span>{error}</span>
            {(loadError || versionError) && (
              <button
                type="button"
                className="workspace-button border border-white/10 bg-white/[0.04]"
                onClick={() => setRetry((value) => value + 1)}
                disabled={busy}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <fieldset disabled={saving} className="grid min-w-0 gap-4 border-0 p-0">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {([1, 2] as const).map((slot) => {
              const deckKey = slot === 1 ? "deck1Id" : "deck2Id";
              const versionKey = slot === 1 ? "deck1VersionId" : "deck2VersionId";
              const originalVersion =
                slot === 1 ? match.deck1_version : match.deck2_version;
              const selectedVersion = draft[versionKey];
              const rows = versions[slot - 1].filter(
                (version) => String(version.deck_id) === draft[deckKey],
              );
              return (
                <div key={slot} className="workspace-inset grid min-w-0 gap-3 p-3">
                  <label className={fieldClass}>
                    Deck {slot}
                    <select
                      className={controlClass}
                      value={draft[deckKey]}
                      disabled={loadingDecks || Boolean(loadError)}
                      onChange={(event) => {
                        setSaveError("");
                        setDraft((current) =>
                          changeMatchParticipant(
                            current, slot, event.target.value, match,
                          ),
                        );
                      }}
                    >
                      {!decks.some((deck) => String(deck.id) === draft[deckKey]) && (
                        <option value={draft[deckKey]}>
                          {participants[slot - 1].name}
                        </option>
                      )}
                      {decks.map((deck) => (
                        <option
                          key={deck.id}
                          value={deck.id}
                          disabled={
                            String(deck.id) === draft[slot === 1 ? "deck2Id" : "deck1Id"]
                          }
                        >
                          {deck.name}{deck.active ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldClass}>
                    Version
                    <select
                      aria-label={`Deck ${slot} version`}
                      className={controlClass}
                      value={selectedVersion}
                      disabled={loadingVersions || Boolean(versionError)}
                      onChange={(event) => updateField(versionKey, event.target.value)}
                    >
                      {selectedVersion === "active" && (
                        <option value="active">Active version</option>
                      )}
                      <option value="">Not recorded</option>
                      {selectedVersion && selectedVersion !== "active" &&
                        !rows.some((version) => String(version.id) === selectedVersion) && (
                        <option value={selectedVersion}>
                          {originalVersion?.version_name ?? `Version ${selectedVersion}`}
                        </option>
                      )}
                      {rows.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.version_name}{version.is_active ? " (active)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className={fieldClass}>
              Winner
              <select
                className={controlClass}
                value={draft.winnerId}
                onChange={(event) => updateField("winnerId", event.target.value)}
              >
                <option value="">Undecided</option>
                {participants.map((deck) => (
                  <option key={deck.id} value={deck.id}>{deck.name}</option>
                ))}
              </select>
            </label>
            <label className={fieldClass}>
              First player
              <select
                className={controlClass}
                value={draft.firstPlayerId}
                onChange={(event) => updateField("firstPlayerId", event.target.value)}
              >
                <option value="">Not recorded</option>
                {participants.map((deck) => (
                  <option key={deck.id} value={deck.id}>{deck.name}</option>
                ))}
              </select>
            </label>
            <label className={fieldClass}>
              Format
              <select
                className={controlClass}
                value={draft.format}
                onChange={(event) =>
                  updateField("format", event.target.value as MatchEditDraft["format"])
                }
              >
                <option value="">Not recorded</option>
                <option value="Any">Any</option>
                <option value="Standard">Standard</option>
                <option value="Stride">Stride</option>
              </select>
            </label>
            <label className={fieldClass}>
              Played (Chicago time)
              <input
                type="datetime-local"
                step="1"
                required
                className={controlClass}
                value={draft.playedAt}
                onInput={(event) => updateField("playedAt", event.currentTarget.value)}
              />
            </label>
          </div>
          <label className={fieldClass}>
            Notes
            <textarea
              className={`${controlClass} min-h-28 resize-y`}
              rows={4}
              value={draft.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </label>
        </fieldset>
      </form>
    </ModalDialog>
  );
}
