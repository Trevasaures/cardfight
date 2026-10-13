import type { TableSession } from "../playtest.ts";
import type { RuleToken } from "./types.ts";

/** A token flag is part of the same immutable snapshot as its triggering ride. */
export function setRuleToken(
  session: TableSession,
  token: RuleToken,
  enabled: boolean,
): TableSession {
  if (session.phase === "mulligan" || session.rules.tokens[token] === enabled) {
    return session;
  }
  const name = token === "energyGenerator"
    ? "Energy Generator"
    : "SYSTEM CODE: X-ceed";
  return {
    ...session,
    rules: {
      ...session.rules,
      tokens: { ...session.rules.tokens, [token]: enabled },
    },
    log: [...session.log.slice(-39), `${name} ${enabled ? "placed" : "removed"}.`],
  };
}
