import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { NATION_COLORS } from "../utils/nations";

import { createDeck, getDeckOptions, getDecks, updateDeck } from "../api/decks";
import { DeckCard } from "../components/cards/DeckCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkspaceSectionHeader } from "../components/layout/WorkspaceSectionHeader";
import type { Deck, DeckOptionsResponse, DeckType } from "../types/api";

type EditorMode = "create" | "edit";

type EditState = {
  mode: EditorMode;
  id?: number;
  name: string;
  type: DeckType;
  nation: string | null;
  active: boolean;
};

const EMPTY_EDITOR: EditState = {
  mode: "create",
  name: "",
  type: "Standard",
  nation: null,
  active: true,
};

function getNationPreviewIcon(
  nationName: string | null,
  options: DeckOptionsResponse,
) {
  if (!nationName) return null;
  const nation = options.nations.find((item) => item.name === nationName);
  return nation ? `/nations/${nation.icon}` : null;
}

export function DeckLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedNation = searchParams.get("nation") ?? "";
  const [decks, setDecks] = useState<Deck[]>([]);
  const [options, setOptions] = useState<DeckOptionsResponse>({
    types: ["Standard", "Stride"],
    nations: [],
  });

  const [editingDeck, setEditingDeck] = useState<EditState | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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

  async function loadDecks() {
    setError(null);
    setLoading(true);

    try {
      const [deckRows, deckOptions] = await Promise.all([
        getDecks(true),
        getDeckOptions(),
      ]);

      setDecks(deckRows);
      setOptions(deckOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDecks();
  }, []);

  const filteredDecks = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return decks.filter((deck) => {
      const matchesSearch =
        !needle ||
        deck.name.toLowerCase().includes(needle) ||
        deck.type.toLowerCase().includes(needle) ||
        (deck.nation ?? "").toLowerCase().includes(needle);

      const matchesActive = showInactive || deck.active;

      return matchesSearch && matchesActive && (!selectedNation || deck.nation === selectedNation);
    });
  }, [decks, search, showInactive, selectedNation]);

  function openCreateEditor() {
    setMessage(null);
    setError(null);
    setEditingDeck(EMPTY_EDITOR);
  }

  function openEditEditor(deck: Deck) {
    setMessage(null);
    setError(null);

    setEditingDeck({
      mode: "edit",
      id: deck.id,
      name: deck.name,
      type: deck.type,
      nation: deck.nation,
      active: deck.active,
    });
  }

  function closeEditor() {
    if (saving) return;
    setEditingDeck(null);
  }

  async function saveDeck() {
    if (!editingDeck) return;

    const name = editingDeck.name.trim();

    if (!name) {
      setError("Deck name cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (editingDeck.mode === "create") {
        const created = await createDeck({
          name,
          type: editingDeck.type,
          nation: editingDeck.nation,
          active: editingDeck.active,
        });

        setDecks((current) =>
          [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setMessage(`Created ${created.name}.`);
      } else {
        if (!editingDeck.id) {
          throw new Error("Missing deck id for edit.");
        }

        const updated = await updateDeck(editingDeck.id, {
          name,
          type: editingDeck.type,
          nation: editingDeck.nation,
          active: editingDeck.active,
        });

        setDecks((current) =>
          current
            .map((deck) => (deck.id === updated.id ? updated : deck))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setMessage(`Saved ${updated.name}.`);
      }

      setEditingDeck(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = decks.filter((deck) => deck.active).length;
  const inactiveCount = decks.length - activeCount;
  const previewIcon = editingDeck
    ? getNationPreviewIcon(editingDeck.nation, options)
    : null;

  return (
    <>
      <PageHeader title="Deck Library" />

      <section className="workspace-panel">

        <div className="workspace-inset overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 px-3 py-2.5 text-xs text-slate-500 sm:px-4">
            <span><strong className="mr-1.5 font-black text-slate-100">{decks.length}</strong>Total decks</span>
            <span><strong className="mr-1.5 font-black text-emerald-100">{activeCount}</strong>Active</span>
            <span><strong className="mr-1.5 font-black text-slate-300">{inactiveCount}</strong>Inactive</span>
            <span className="sm:ml-auto">{filteredDecks.length} shown</span>
            <button
              type="button"
              onClick={openCreateEditor}
              className="workspace-button inline-flex items-center justify-center gap-2 bg-cyan-300 px-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              <Plus className="h-4 w-4" />
              Add deck
            </button>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-4">
          <label className="relative block min-w-0">
            <span className="sr-only">Search decks</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks, formats, or nations..."
              className="workspace-control w-full !pl-9 placeholder:text-slate-600"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            aria-pressed={showInactive}
            className={[
              "workspace-button border px-3 text-xs font-bold transition",
              showInactive
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
            ].join(" ")}
          >
            {showInactive ? "Including inactive" : "Active only"}
          </button>
          </div>
        </div>
        <div className="nation-filter" aria-label="Filter decks by nation">
          {["", ...Object.keys(NATION_COLORS)].map((nation) => <button key={nation} type="button" aria-pressed={selectedNation === nation} onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); if (nation) next.set("nation", nation); else next.delete("nation"); return next; })}>{nation || "All nations"}</button>)}
        </div>
      </section>

      {loading ? (
        <div className="workspace-panel mt-4 text-sm text-slate-400">
          Loading decks...
        </div>
      ) : filteredDecks.length ? (
        <section className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} onEdit={openEditEditor} />
          ))}
        </section>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
          <p className="text-sm font-bold text-slate-300">No decks found.</p>

        </div>
      )}

      {editingDeck ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingDeck.mode === "create" ? "Create deck profile" : "Edit deck profile"}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black sm:p-5"
          >
            <WorkspaceSectionHeader
              title={editingDeck.mode === "create" ? "New deck" : "Edit deck"}
              actions={
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Close deck editor"
                className="workspace-button inline-flex w-10 items-center justify-center border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.1]"
              >
                <X className="h-4 w-4" />
              </button>
              }
            />

            <div className="mt-4 grid gap-4">
              <div className="workspace-inset flex items-center gap-3 p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30">
                  {previewIcon ? (
                    <img
                      src={previewIcon}
                      alt={editingDeck.nation ?? "Nation preview"}
                      className="h-9 w-9 object-contain"
                    />
                  ) : (
                    <span className="text-2xl font-black text-slate-700">?</span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                  <p className="mt-0.5 break-words text-sm font-bold text-slate-100">
                    {editingDeck.name.trim() || "Unnamed deck"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {editingDeck.nation ?? "No nation selected"} · {editingDeck.type}
                  </p>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Deck name
                </span>
                <input
                  value={editingDeck.name}
                  onChange={(event) =>
                    setEditingDeck((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className="workspace-control min-w-0"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Format
                  </span>
                  <select
                    value={editingDeck.type}
                    onChange={(event) =>
                      setEditingDeck((current) =>
                        current
                          ? { ...current, type: event.target.value as DeckType }
                          : current,
                      )
                    }
                    className="workspace-control min-w-0"
                  >
                    {options.types.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Nation logo
                  </span>
                  <select
                    value={editingDeck.nation ?? ""}
                    onChange={(event) =>
                      setEditingDeck((current) =>
                        current
                          ? {
                              ...current,
                              nation: event.target.value || null,
                            }
                          : current,
                      )
                    }
                    className="workspace-control min-w-0"
                  >
                    <option value="">No nation selected</option>
                    {options.nations.map((nation) => (
                      <option key={nation.name} value={nation.name}>
                        {nation.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="workspace-inset p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      Active status
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Inactive decks are hidden from Play Lab random rolls.
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-pressed={editingDeck.active}
                    onClick={() =>
                      setEditingDeck((current) =>
                        current ? { ...current, active: !current.active } : current,
                      )
                    }
                    className={[
                      "workspace-button border px-3 text-xs font-bold transition",
                      editingDeck.active
                        ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                        : "border-slate-300/20 bg-slate-300/10 text-slate-300",
                    ].join(" ")}
                  >
                    {editingDeck.active ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={closeEditor}
                className="workspace-button border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveDeck}
                disabled={saving}
                className="workspace-button inline-flex items-center gap-2 bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save deck"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
