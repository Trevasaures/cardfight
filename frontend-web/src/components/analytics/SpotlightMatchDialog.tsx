import { useEffect, useId, useRef } from "react";
import { ArrowRight, Trophy, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { SpotlightMatch } from "../../types/api";
import { formatDateTime } from "../../utils/format";

type SpotlightMatchDialogProps = {
  match: SpotlightMatch;
  deckName: string;
  historyUrl: string;
  onClose: () => void;
};

export function SpotlightMatchDialog({ match, deckName, historyUrl, onClose }: SpotlightMatchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const resultId = useId();
  const won = match.result === "W";
  const resultLabel = match.result === "U" ? "No winner recorded" : `${won ? deckName : match.opponent_name} won`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={resultId}
      onClose={(event) => {
        // Strict Mode may close and reopen this node before its queued close event runs.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        // Ignore clicks inside the panel, including its padding; only dismiss the backdrop.
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-500">Match details</p>
            <h2 id={titleId} className="mt-2 break-words text-xl font-black">
              {deckName} <span className="font-medium text-slate-500">vs</span> {match.opponent_name}
            </h2>
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(match.date_played)}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close match details"
            className="workspace-button inline-flex w-10 shrink-0 items-center justify-center border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`mt-5 flex items-center gap-3 rounded-xl border p-3 ${won ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>
          <Trophy className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p id={resultId} className="break-words text-sm font-bold">{resultLabel}</p>
            <p className="mt-0.5 break-words text-xs opacity-80">
              {match.result === "U" ? "Undecided game" : `${won ? "Win" : "Loss"} for ${deckName}`}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="workspace-inset p-3">
            <dt className="text-xs text-slate-500">Turn order</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {match.turn_order === "unknown" ? "Not recorded" : `${deckName} went ${match.turn_order}`}
            </dd>
          </div>
          <div className="workspace-inset p-3">
            <dt className="text-xs text-slate-500">Deck version played</dt>
            <dd className="mt-1 break-words text-sm font-semibold">{match.version_name ?? "Not recorded"}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <h3 className="text-xs font-bold text-slate-400">Match notes</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
            {match.notes?.trim() ? match.notes : "No notes recorded for this match."}
          </p>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <Link to={historyUrl} className="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-cyan-200 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-300">
            Open {deckName} match history <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      </div>
    </dialog>
  );
}
