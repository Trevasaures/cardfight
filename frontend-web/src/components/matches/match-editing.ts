import type { Match, MatchFormat, UpdateMatchPayload } from "../../types/api";

export type MatchEditDraft = {
  deck1Id: string;
  deck2Id: string;
  deck1VersionId: string;
  deck2VersionId: string;
  winnerId: string;
  firstPlayerId: string;
  format: MatchFormat | "";
  playedAt: string;
  notes: string;
};

function inputDate(value: string | null) {
  // Match timestamps are stored as Chicago wall time, without a UTC offset.
  // Avoid Date conversions, which would shift them in another browser timezone.
  return value?.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/)?.[0] ?? "";
}

export function createMatchEditDraft(match: Match): MatchEditDraft {
  return {
    deck1Id: String(match.deck1_id),
    deck2Id: String(match.deck2_id),
    deck1VersionId: String(match.deck1_version_id ?? ""),
    deck2VersionId: String(match.deck2_version_id ?? ""),
    winnerId: String(match.winner_id ?? ""),
    firstPlayerId: String(match.first_player_id ?? ""),
    format: match.format ?? "",
    playedAt: inputDate(match.date_played_iso),
    notes: match.notes,
  };
}

export function changeMatchParticipant(
  draft: MatchEditDraft,
  slot: 1 | 2,
  deckId: string,
  match: Match,
): MatchEditDraft {
  const originalDeckId = slot === 1 ? match.deck1_id : match.deck2_id;
  const originalVersionId =
    slot === 1 ? match.deck1_version_id : match.deck2_version_id;
  const next = {
    ...draft,
    [slot === 1 ? "deck1Id" : "deck2Id"]: deckId,
    [slot === 1 ? "deck1VersionId" : "deck2VersionId"]:
      deckId === String(originalDeckId)
        ? String(originalVersionId ?? "")
        : "active",
  };
  const participants = [next.deck1Id, next.deck2Id];
  return {
    ...next,
    winnerId: participants.includes(next.winnerId) ? next.winnerId : "",
    firstPlayerId: participants.includes(next.firstPlayerId)
      ? next.firstPlayerId
      : "",
  };
}

export function validateMatchEdit(draft: MatchEditDraft): string | null {
  if (!draft.deck1Id || !draft.deck2Id) return "Choose both decks.";
  if (draft.deck1Id === draft.deck2Id) return "Choose two different decks.";
  const participants = [draft.deck1Id, draft.deck2Id];
  if (draft.winnerId && !participants.includes(draft.winnerId))
    return "Choose a winner from this match.";
  if (draft.firstPlayerId && !participants.includes(draft.firstPlayerId))
    return "Choose a first player from this match.";
  if (!draft.playedAt) return "Choose when this match was played.";
  return null;
}

export function matchEditPayload(
  match: Match,
  draft: MatchEditDraft,
): UpdateMatchPayload {
  const payload: UpdateMatchPayload = {
    deck1_id: Number(draft.deck1Id),
    deck2_id: Number(draft.deck2Id),
    winner_id: draft.winnerId ? Number(draft.winnerId) : null,
    first_player_id: draft.firstPlayerId ? Number(draft.firstPlayerId) : null,
    format: draft.format || null,
    notes: draft.notes.trim(),
  };
  // An omitted version picks the replacement deck's active list. Explicit null
  // means the historical version is unknown and must stay unrecorded.
  if (draft.deck1VersionId !== "active")
    payload.deck1_version_id = draft.deck1VersionId
      ? Number(draft.deck1VersionId)
      : null;
  if (draft.deck2VersionId !== "active")
    payload.deck2_version_id = draft.deck2VersionId
      ? Number(draft.deck2VersionId)
      : null;
  // Keep the original seconds and fractional precision on unrelated edits.
  if (draft.playedAt !== inputDate(match.date_played_iso))
    payload.date_played = draft.playedAt;
  return payload;
}

export function isMatchEditDirty(match: Match, draft: MatchEditDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createMatchEditDraft(match));
}
