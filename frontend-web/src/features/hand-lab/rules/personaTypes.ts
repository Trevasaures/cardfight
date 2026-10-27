/** Only the generated identity counter is stored; ticket effects remain manual. */
export type PersonaState = {
  nextTicket: number;
};

export function emptyPersona(): PersonaState {
  return { nextTicket: 1 };
}
