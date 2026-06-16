import { useEffect, useState } from "react";

import { getDecks } from "../api/decks";
import { DeckCard } from "../components/cards/DeckCard";
import { PageHeader } from "../components/layout/PageHeader";
import type { Deck } from "../types/api";

export function DeckLibrary() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDecks(true)
      .then(setDecks)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load decks"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Deck Library"
        title="Your testing roster"
        description="This is the first React version of the deck library. For now it is read-only while we build the new interface layer."
      />

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading decks...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">
          {error}
        </div>
      ) : decks.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-500">
          No decks found.
        </div>
      )}
    </>
  );
}