import type { DeckCardEntry } from "../../../types/api.ts";
import type { TableCard, TableSession } from "../playtest.ts";
import { emptyPersona, type PersonaState } from "./personaTypes.ts";

/** Synthetic display metadata is never saved to the card catalog or deck list. */
export const PERSONA_TICKET_ENTRY: DeckCardEntry = {
  id: -1,
  card_id: -1,
  deck_version_id: -1,
  printing_id: null,
  quantity: 1,
  zone: "token",
  sort_order: 0,
  printing: null,
  created_at: null,
  updated_at: null,
  card: {
    id: -1,
    name: "Persona Shield",
    grade: 0,
    nation: null,
    card_type: "Blitz Order",
    clan: null,
    race: null,
    power: null,
    shield: null,
    critical: null,
    trigger_type: null,
    skill_text: [
      "Choose a unit being attacked. It gets +10,000 power for this battle (+15,000 if your opponent has a crest other than Energy Generator).",
      "Apply and remove its power bonus with the sandbox power controls. Timing and other card conditions remain manual.",
      "This ticket cannot pay your ride-deck discard or be chosen from hand by your own abilities during your turn. After use it disappears from drop; it cannot remain outside hand or the order area.",
    ].join("\n\n"),
    flavor_text: "",
    source: "hand-lab",
    external_id: null,
    primary_printing: null,
    printings: [],
    created_at: null,
    updated_at: null,
  },
};

export function personaState(session: TableSession): PersonaState {
  return session.persona ?? emptyPersona();
}

function record(session: TableSession, message: string): TableSession {
  return { ...session, log: [...session.log.slice(-39), message] };
}

/** Resolve the source ability and its costs manually, then add its ticket.
 * One immutable snapshot keeps generation atomic for Undo and session recovery. */
export function addPersonaShieldTicket(session: TableSession): TableSession {
  const state = personaState(session);
  if (
    session.phase === "mulligan" ||
    !Number.isSafeInteger(state.nextTicket) || state.nextTicket < 1 ||
    !Number.isSafeInteger(state.nextTicket + 1)
  ) return session;
  const ticket: TableCard = {
    key: `ticket:personaShield:${state.nextTicket}`,
    cardId: -1,
    entryId: -1,
    ticket: "personaShield",
    rested: false,
    faceDown: false,
    power: 0,
    critical: 0,
  };
  return record(
    {
      ...session,
      zones: { ...session.zones, hand: [...session.zones.hand, ticket] },
      persona: { nextTicket: state.nextTicket + 1 },
    },
    "Added Persona Shield to hand.",
  );
}

/** Use or remove a generated hand ticket manually. Power and ability timing stay
 * under the player's control; removing the copy never changes physical piles. */
export function removePersonaTicket(
  session: TableSession,
  ticketKey: string,
): TableSession {
  if (
    session.phase === "mulligan" ||
    !session.zones.hand.some(
      (card) => card.key === ticketKey && card.ticket === "personaShield",
    )
  ) return session;
  return record(
    {
      ...session,
      zones: {
        ...session.zones,
        hand: session.zones.hand.filter((card) => card.key !== ticketKey),
      },
    },
    "Removed Persona Shield.",
  );
}
