import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Layers3, RefreshCcw } from "lucide-react";
import { getDecks } from "../api/decks";
import { getDeckVersion, getDeckVersions } from "../api/deckBuilder";
import { PageHeader } from "../components/layout/PageHeader";
import { HandTable } from "../features/hand-lab/HandTable";
import { mainDeckCopies } from "../features/hand-lab/engine";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Deck, DeckVersion, DeckVersionSummary } from "../types/api";
import "../features/hand-lab/hand-lab.css";

function HandWorkspace({ version }: { version: DeckVersion }) {
  const pool = useMemo(() => {
    try {
      return { copies: mainDeckCopies(version.cards), error: null };
    } catch (error) {
      return {
        copies: [],
        error:
          error instanceof Error
            ? error.message
            : "Could not read this deck list.",
      };
    }
  }, [version]);

  if (pool.error)
    return (
      <p role="alert" className="hand-error">
        {pool.error}
      </p>
    );
  return (
    <>
      {pool.copies.length !== 50 && (
        <p className="hand-practice-notice">
          Practice list · {pool.copies.length}/50 main-deck cards
        </p>
      )}
      <HandTable version={version} copies={pool.copies} />
    </>
  );
}

export function HandLab() {
  const [params, setParams] = useSearchParams();
  const [source, setSource] = usePersistentState<{
    deckId: number;
    versionId: number;
  }>("cardfight.hand-lab.source", { deckId: 0, versionId: 0 });
  const [reload, setReload] = useState(0);
  const [decks, setDecks] = useState<{
    items: Deck[];
    loading: boolean;
    error: string | null;
  }>({ items: [], loading: true, error: null });
  const [versions, setVersions] = useState<{
    deckId: number;
    items: DeckVersionSummary[];
    loading: boolean;
    error: string | null;
  }>({ deckId: 0, items: [], loading: false, error: null });
  const [detail, setDetail] = useState<{
    id: number;
    value: DeckVersion | null;
    error: string | null;
  }>({ id: 0, value: null, error: null });
  // Builder links take priority over the last locally remembered deck/version.
  const requestedDeckId = Number(params.get("deck") || source?.deckId);
  const deck =
    decks.items.find((item) => item.id === requestedDeckId) ??
    decks.items.find((item) => item.active) ??
    decks.items[0];
  const deckId = deck?.id ?? 0;
  // Ignore results belonging to the previous selection while its replacement loads.
  const versionRows = versions.deckId === deckId ? versions.items : [];
  const requestedVersionId = Number(
    params.get("version") || (source?.deckId === deckId ? source.versionId : 0),
  );
  const selectedVersion =
    versionRows.find((item) => item.id === requestedVersionId) ??
    versionRows.find((item) => item.is_active) ??
    versionRows[0];
  const versionId = selectedVersion?.id ?? 0;
  const currentVersion = detail.id === versionId ? detail.value : null;
  const loading =
    decks.loading ||
    Boolean(deckId && (versions.deckId !== deckId || versions.loading)) ||
    Boolean(
      versionId &&
        !currentVersion &&
        !(detail.id === versionId && detail.error),
    );
  const error =
    decks.error ||
    (versions.deckId === deckId ? versions.error : null) ||
    (detail.id === versionId ? detail.error : null);

  useEffect(() => {
    // Each loader ignores late responses after selection changes or unmounting.
    let cancelled = false;
    setDecks((current) => ({ ...current, loading: true, error: null }));
    getDecks(true)
      .then((items) => {
        if (!cancelled) setDecks({ items, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setDecks({
            items: [],
            loading: false,
            error:
              error instanceof Error ? error.message : "Could not load decks.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    setVersions({ deckId, items: [], loading: true, error: null });
    getDeckVersions(deckId)
      .then((items) => {
        if (!cancelled)
          setVersions({ deckId, items, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setVersions({
            deckId,
            items: [],
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not load versions.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, reload]);

  useEffect(() => {
    if (!versionId) return;
    let cancelled = false;
    setDetail({ id: versionId, value: null, error: null });
    getDeckVersion(versionId)
      .then((value) => {
        if (!cancelled) setDetail({ id: versionId, value, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setDetail({
            id: versionId,
            value: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load this version.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, reload]);

  useEffect(() => {
    if (currentVersion)
      setSource((previous) =>
        previous?.deckId === deckId && previous?.versionId === versionId
          ? previous
          : { deckId, versionId },
      );
  }, [currentVersion, deckId, versionId, setSource]);

  function chooseDeck(id: number) {
    setSource({ deckId: id, versionId: 0 });
    setParams({ deck: String(id) });
  }
  function chooseVersion(id: number) {
    setSource({ deckId, versionId: id });
    setParams({ deck: String(deckId), version: String(id) });
  }
  function prepareBuilder() {
    try {
      if (deckId)
        window.localStorage.setItem(
          "cardfight.deck-builder.selected-deck",
          JSON.stringify(String(deckId)),
        );
      if (versionId)
        window.localStorage.setItem(
          "cardfight.deck-builder.selected-version",
          JSON.stringify(String(versionId)),
        );
    } catch {
      /* Navigation remains available when local storage is disabled. */
    }
  }

  return (
    <>
      <PageHeader title="Hand Lab" />
      <div className="space-y-4">
        <section
          className="workspace-panel hand-source"
          aria-label="Hand Lab deck selection"
        >
          <label>
            Deck
            <select
              className="workspace-control"
              aria-label="Practice deck"
              value={deckId || ""}
              disabled={decks.loading || !decks.items.length}
              onChange={(event) => chooseDeck(Number(event.target.value))}
            >
              {!decks.items.length && (
                <option value="">
                  {decks.loading ? "Loading decks…" : "No decks"}
                </option>
              )}
              {decks.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.active ? "" : " · Inactive"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Version
            <select
              className="workspace-control"
              aria-label="Practice version"
              value={versionId || ""}
              disabled={versions.loading || !versionRows.length}
              onChange={(event) => chooseVersion(Number(event.target.value))}
            >
              {!versionRows.length && (
                <option value="">
                  {loading ? "Loading versions…" : "No versions"}
                </option>
              )}
              {versionRows.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.version_name}
                  {item.is_active ? " · Active" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="hand-source-actions">
            <Link
              to="/deck-builder"
              onClick={prepareBuilder}
              className="hand-button"
            >
              Builder <ArrowUpRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              className="hand-button"
              aria-label="Refresh deck lists"
              disabled={loading}
            >
              <RefreshCcw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </section>

        {error ? (
          <p role="alert" className="hand-error">
            {error}
          </p>
        ) : loading ? (
          <div className="workspace-panel hand-loading" role="status">
            <RefreshCcw size={20} className="animate-spin" />
            Loading deck…
          </div>
        ) : currentVersion ? (
          // Changing the source remounts the table, clearing its temporary session and drag state.
          <HandWorkspace
            key={`${currentVersion.id}:${currentVersion.updated_at}:${reload}`}
            version={currentVersion}
          />
        ) : (
          <section className="workspace-panel hand-empty">
            <Layers3 size={40} strokeWidth={1} />
            <h2>{deck ? "No saved versions" : "No decks yet"}</h2>
            <Link
              to="/deck-builder"
              onClick={prepareBuilder}
              className="cinema-button"
            >
              Open Deck Builder <ArrowUpRight size={14} />
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
