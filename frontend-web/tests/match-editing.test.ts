import assert from "node:assert/strict";
import test from "node:test";
import {
  changeMatchParticipant,
  createMatchEditDraft,
  isMatchEditDirty,
  matchEditPayload,
  validateMatchEdit,
} from "../src/components/matches/match-editing.ts";
import type { Match } from "../src/types/api.ts";

const match = {
  id: 4,
  deck1_id: 10,
  deck2_id: 20,
  deck1_version_id: 100,
  deck2_version_id: null,
  winner_id: 10,
  first_player_id: 20,
  format: "Standard",
  date_played_iso: "2026-10-15T14:03:29.123456",
  notes: "Original notes",
} as Match;

test("unrelated match edits preserve historical versions and exact played timestamp", () => {
  const draft = createMatchEditDraft(match);
  assert.equal(draft.playedAt, "2026-10-15T14:03:29");
  assert.equal(isMatchEditDirty(match, draft), false);
  const payload = matchEditPayload(match, { ...draft, notes: " Updated notes " });
  assert.equal(payload.notes, "Updated notes");
  assert.equal(payload.deck1_version_id, 100);
  assert.equal(payload.deck2_version_id, null);
  assert.equal(Object.hasOwn(payload, "date_played"), false);
});

test("changing a participant clears only invalid match choices and defaults its active version", () => {
  const original = createMatchEditDraft(match);
  const changed = changeMatchParticipant(original, 1, "30", match);
  assert.equal(changed.winnerId, "");
  assert.equal(changed.firstPlayerId, "20");
  assert.equal(changed.deck1VersionId, "active");
  assert.equal(changed.deck2VersionId, "");
  assert.equal(original.deck1Id, "10");
  const payload = matchEditPayload(match, changed);
  assert.equal(Object.hasOwn(payload, "deck1_version_id"), false);
  assert.equal(payload.deck2_version_id, null);
  assert.equal(payload.winner_id, null);
  assert.equal(validateMatchEdit(changed), null);

  const otherChanged = changeMatchParticipant(original, 2, "30", match);
  assert.equal(otherChanged.winnerId, "10");
  assert.equal(otherChanged.firstPlayerId, "");
  assert.equal(otherChanged.deck1VersionId, "100");
});

test("returning to the original participant restores its recorded historical version", () => {
  const draft = createMatchEditDraft(match);
  const changed = changeMatchParticipant(draft, 1, "30", match);
  const restored = changeMatchParticipant(changed, 1, "10", match);
  assert.equal(restored.deck1VersionId, "100");
  assert.equal(matchEditPayload(match, restored).deck1_version_id, 100);
});

test("match editor supports correcting result, turn order, versions, format and Chicago date", () => {
  const draft = {
    ...createMatchEditDraft(match),
    winnerId: "20",
    firstPlayerId: "",
    deck1VersionId: "",
    deck2VersionId: "200",
    format: "" as const,
    playedAt: "2026-10-14T23:45:00",
    notes: "",
  };
  assert.equal(isMatchEditDirty(match, draft), true);
  assert.equal(validateMatchEdit(draft), null);
  assert.deepEqual(matchEditPayload(match, draft), {
    deck1_id: 10,
    deck2_id: 20,
    deck1_version_id: null,
    deck2_version_id: 200,
    winner_id: 20,
    first_player_id: null,
    format: null,
    date_played: "2026-10-14T23:45:00",
    notes: "",
  });
});

test("match editor rejects duplicate decks, unrelated results and missing played date", () => {
  const draft = createMatchEditDraft(match);
  for (const invalid of [
    { ...draft, deck1Id: "" },
    { ...draft, deck2Id: "10" },
    { ...draft, winnerId: "30" },
    { ...draft, firstPlayerId: "30" },
    { ...draft, playedAt: "" },
  ]) {
    assert.ok(validateMatchEdit(invalid));
  }
});

test("unknown match metadata stays unknown during a notes edit", () => {
  const unknown = {
    ...match,
    winner_id: null,
    first_player_id: null,
    format: null,
    deck1_version_id: null,
  };
  const payload = matchEditPayload(unknown, createMatchEditDraft(unknown));
  assert.equal(payload.winner_id, null);
  assert.equal(payload.first_player_id, null);
  assert.equal(payload.format, null);
  assert.equal(payload.deck1_version_id, null);
});
