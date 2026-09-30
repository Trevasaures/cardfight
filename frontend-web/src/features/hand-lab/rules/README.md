# Hand Lab rules

This is a small, deterministic rules layer inside the solo sandbox. It does not
parse saved ability text or implement a full competitive rules engine. Unknown
abilities, costs, trigger effects, ride restrictions, and opponent interactions
remain manual.

## Responsibilities

- `types.ts`: context, virtual tokens, and serializable choices. Physical cards
  remain in `TableSession.zones`; AutoMOD gauges have their own zone, not Order.
- `wirbel.ts`: current energy limit. Kenig on VC plus Energy Generator in Crest
  permits 15. Original Wirbel and other boards use 10. Energy charging stays manual.
- `luard.ts`: effective grade in Drop and the resulting Ritual count. D-SS10
  Morfessa loses one grade unconditionally; G-BT09 requires GB1. Unrecognized
  printings keep their printed grade. Other Luard abilities remain manual.
- `impauldio.ts`: opponent-turn damage arrivals queue X-ceed choices. Each choice
  moves one selected drop copy to AutoMOD, then evaluates +5k with the new count.
  At three or fewer gauges a non-trigger damage check is needed; at four or more
  the bonus applies regardless of the check. It is a turn bonus, never a passive
  bonus per gauge. Normal trigger effects remain manual to preserve target choice.
- `index.ts`: one post-action entry point. It observes transitions and reconciles
  derived limits before the table records one undo snapshot.
- `storage.ts`: validation and schema-1 migration, including historical frames.
- `RuleControls.tsx`: small counters, virtual token setup, and explicit choices.

## Adding a rule

Put the card-specific condition in its own module. Match a verified card identity
and printing where versions differ; never infer abilities from a deck's title.
Derive counts, grades, and continuous conditions from the current snapshot rather
than incrementing stored counters. This prevents stale values after manual moves,
Undo, or restoring a session. A future continuous-power calculation should stay
separate from `TableCard.power`, which stores bonuses that expire at turn end.

For a triggered ability, observe a completed transition in `applyRules`. Queue
decisions in `RuleState` and expose a pure resolver for the player's choice. Keep
card movements and the resulting effects in one snapshot. Undo and restore must
not replay event handlers. Add transition tests, including no-op actions, missing
resources, expiration, and saved-session compatibility.

Virtual tokens represent tokens omitted from the deck list. Place them when gained
using Rule tokens; they do not synthesize inventory cards or mutate the catalog.
Actual Energy Generator in Crest or X-ceed in Order also activates the same rules.
With pending X-ceed choices, phase advance and further checks wait for resolution;
other sandbox moves remain available for manual sequencing.

## Verified references

- [Wirbel Kenig — DZ-BT15 official card list](https://en.cf-vanguard.com/cardlist/cardsearch/?expansion=257&sort=no&view=text)
- [SYSTEM CODE: X-ceed — official card text](https://cf-vanguard.com/cardlist/?cardno=D-PR%2F1677)
- [Standard Morfessa — D-SS10/006EN](https://en.cf-vanguard.com/cardlist/?cardno=D-SS10%2F006EN)
- [Original Morfessa — official G-BT09 preview](https://en.cf-vanguard.com/wordpress/wp-content/uploads/weekly_vg_1108.pdf)

Consult the current card text when expanding support; similarly named cards can
have different conditions. The source links support these implemented helpers,
not a claim that every ability on those cards is automated.
