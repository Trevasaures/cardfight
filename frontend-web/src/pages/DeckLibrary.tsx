import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, X } from "lucide-react";

import { createDeck, getDeckOptions, getDecks, updateDeck } from "../api/decks";
import { DeckCard } from "../components/cards/DeckCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
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

      return matchesSearch && matchesActive;
    });
  }, [decks, search, showInactive]);

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
      <PageHeader
        eyebrow="Deck Library"
        title="Your testing roster"
        description="Create, edit, organize, and toggle decks used by Play Lab and match logging."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Total decks</p>
          <p className="mt-2 text-3xl font-black">{decks.length}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Active</p>
          <p className="mt-2 text-3xl font-black text-emerald-100">
            {activeCount}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Inactive</p>
          <p className="mt-2 text-3xl font-black text-slate-300">
            {inactiveCount}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks, formats, or nations..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            className={[
              "rounded-2xl border px-5 py-3 text-sm font-bold transition",
              showInactive
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
            ].join(" ")}
          >
            {showInactive ? "Showing inactive" : "Active only"}
          </button>

          <button
            type="button"
            onClick={openCreateEditor}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" />
            Add deck
          </button>
        </div>
      </section>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading decks...
        </div>
      ) : filteredDecks.length ? (
        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} onEdit={openEditEditor} />
          ))}
        </section>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center text-slate-500">
          No decks found.
        </div>
      )}

      {editingDeck ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
                  {editingDeck.mode === "create" ? "Create deck" : "Edit deck"}
                </p>
                <h3 className="mt-2 text-2xl font-black">Deck profile</h3>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-white/10 bg-white/[0.05] p-2 text-slate-300 transition hover:bg-white/[0.1]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-5">
              <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-black/30">
                  {previewIcon ? (
                    <img
                      src={previewIcon}
                      alt={editingDeck.nation ?? "Nation preview"}
                      className="h-14 w-14 object-contain"
                    />
                  ) : (
                    <span className="text-2xl font-black text-slate-700">?</span>
                  )}
                </div>

                <div>
                  <p className="text-sm text-slate-500">Preview</p>
                  <p className="mt-1 text-lg font-bold text-slate-100">
                    {editingDeck.name.trim() || "Unnamed deck"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {editingDeck.nation ?? "No nation selected"} · {editingDeck.type}
                  </p>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Deck name
                </span>
                <input
                  value={editingDeck.name}
                  onChange={(event) =>
                    setEditingDeck((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-300">
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
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
                  >
                    {options.types.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-300">
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
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
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

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      Active status
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Inactive decks are hidden from Play Lab random rolls.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingDeck((current) =>
                        current ? { ...current, active: !current.active } : current,
                      )
                    }
                    className={[
                      "rounded-2xl border px-5 py-3 text-sm font-bold transition",
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

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveDeck}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
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
