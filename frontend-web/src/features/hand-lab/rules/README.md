# Hand Lab rules

This is a small, deterministic rules layer inside the solo sandbox. It does not
parse saved ability text or implement a full competitive rules engine. Unknown
abilities, costs, trigger effects, ride restrictions, and opponent interactions
remain manual.

## Responsibilities

- `types.ts`: context, virtual tokens, and serializable choices. Physical cards
  remain in `TableSession.zones`; AutoMOD gauges have their own zone, not Order.
- `tokens.ts`: immutable virtual-token changes, shared by automatic acquisition
  and manual corrections. These flags never create playable card copies.
- `rides.ts`: observes a completed normal ride during the player's Ride phase.
  The new face-up unit must come from Hand or Ride deck, and the previous vanguard
  must enter Soul. Calls, strides, soul promotion, and hidden units are excluded.
- `energy.ts`: places an available physical Energy Generator from Reserve when
  the player rides, or activates a virtual generator on a first ride over grade 0.
  Going second charges 3 at placement. An already active generator charges 3 at
  the beginning of each own Ride phase; these separate timings cannot double-charge.
- `wirbel.ts`: current energy limit. Kenig on VC plus Energy Generator in Crest
  permits 15. Original Wirbel and other boards use 10. Automatic and manual energy
  changes use this same limit.
- `luard.ts`: effective grade in Drop and the resulting Ritual count. D-SS10
  Morfessa loses one grade unconditionally; G-BT09 requires GB1. Unrecognized
  printings keep their printed grade. Other Luard abilities remain manual.
- `impauldio.ts`: original grade-1 Inno Progrett riding over grade 0 gains X-ceed
  only when a grade-3 Impauldio can be revealed from the actual Ride deck. The
  reveal is logged without moving or turning that card; a saved X-ceed token moves
  to Order, otherwise a virtual token activates. Namesakes and missing reveals
  remain manual. Supported opponent-turn damage arrivals queue X-ceed choices. Each choice
  moves one selected drop copy to AutoMOD, then evaluates +5k with the new count.
  At three or fewer gauges a non-trigger damage check is needed; at four or more
  the bonus applies regardless of the check. It is a turn bonus, never a passive
  bonus per gauge. Gauges persist across both turns; only temporary power clears
  at the turn boundary. A pending choice shows the resulting power before adding
  a card. Dropping or moving exactly one Drop card into AutoMOD resolves that same
  choice atomically, so it cannot request a second card for the same damage.
  Normal trigger effects remain manual to preserve target choice.
- `index.ts`: one post-action entry point. It observes transitions and reconciles
  derived limits before the table records one undo snapshot.
- `visibility.ts`: deck-specific presentation and X-ceed event eligibility.
  AutoMOD/X-ceed belongs to Impauldio lists; Ritual belongs to the Luard/Ritual
  family. Unrelated legacy token flags or gauge copies do not enable new effects.
- `storage.ts`: validation and schema-1 migration, including historical frames.
- `RuleControls.tsx`: relevant counters and explicit pending choices. Manual
  X-ceed setup appears only in a supported list before that token is active.

`../EnergyGenerator.tsx` combines the energy meter, manual +/- corrections, and
Generator activation in one tile. Its animation changes only presentation,
respects reduced motion, and cleans up on navigation or subsequent corrections.
`../CrestZone.tsx` adds optional physical crests without duplicating the generator.

## Persona Shield tickets

`persona.ts` handles manual ticket generation and removal;
`personaTypes.ts` stores only the next generated serial.
The toolbar's **Persona Shield** button calls `addPersonaShieldTicket`, adding one
unique generated copy to hand per click after mulligan. It works for any source
card, on either turn, without drawing from the deck or paying costs automatically.
Resolve the source ability's timing, costs, and acquisition limits manually.
There are no card-name mappings or pending acquisition prompts. Recovery drops
obsolete acquisition fields in every saved frame while preserving existing tickets.

Select tickets and use **Remove ticket** in the normal action toolbar when used
or removed by an effect. Removal never applies power or asks for an attacked unit
or crest condition. Those effects, their duration, and order limits remain manual
through the existing unit controls. Own-turn costs and generic unit edits still
reject tickets. Undo restores the prior generated copies and manual adjustments.
Recovery drops retired defense settings in every saved frame, merging a valid old
battle bonus into normal unit power once to preserve the visible total.

Verified text and rulings:

- [Persona Shield and its Q&A](https://en.cf-vanguard.com/cardlist/?cardno=DZ-BT07%2FT04EN)

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

Virtual tokens represent tokens omitted from the deck list. Supported ride events
place them automatically; the Generator tile and X-ceed setup provide manual
fallbacks. They do not synthesize inventory cards or mutate the catalog.
Actual Energy Generator in Crest or X-ceed in Order also activates the same rules.
With pending X-ceed choices, phase advance and further checks wait for resolution;
other sandbox moves remain available for manual sequencing.

Existing pending choices remain resolvable even when a legacy game's deck no longer
identifies Impauldio. Suppressing unrelated new effects never deletes stored cards,
tokens, or history. Undo and session recovery restore recorded snapshots directly
without replaying placement, charging, reveals, or token acquisition.

## Verified references

- [Wirbel Kenig — DZ-BT15 official card list](https://en.cf-vanguard.com/cardlist/cardsearch/?expansion=257&sort=no&view=text)
- [Energy Generator — official BCS2425/VGS04 card text](https://en.cf-vanguard.com/cardlist/?cardno=BCS2425%2FVGS04)
- [Original Inno Progrett — official DZ-BT04/088 card text and reveal ruling](https://cf-vanguard.com/cardlist/?cardno=DZ-BT04%2F088)
- [SYSTEM CODE: X-ceed — official card text](https://cf-vanguard.com/cardlist/?cardno=D-PR%2F1677)
- [Standard Morfessa — D-SS10/006EN](https://en.cf-vanguard.com/cardlist/?cardno=D-SS10%2F006EN)
- [Original Morfessa — official G-BT09 preview](https://en.cf-vanguard.com/wordpress/wp-content/uploads/weekly_vg_1108.pdf)

Consult the current card text when expanding support; similarly named cards can
have different conditions. The source links support these implemented helpers,
not a claim that every ability on those cards is automated.
