# Hand Lab developer notes

Hand Lab runs a solo game from a saved deck version. The page loads the deck data;
the table saves one active game in memory and sessionStorage for the current tab,
without writing practice state back to the API.

## Where to make changes

- `../../pages/HandLab.tsx`: deck/version loading, remembered selection, and table remounts.
- `HandTable.tsx`: session state, undo history, selection, and coordination of the UI.
- `usePlaytestSession.ts`: React integration and saving completed game actions.
- `sessionStore.ts`: tab recovery, source compatibility, save validation, and storage fallback.
- `PlaytestZone.tsx`: circles and piles, including the top card and unit stats.
- `SoulStack.tsx` / `vanguard-stack.css`: ordered artwork layers beneath the vanguard.
- `BattleStatus.tsx` / `battle-status.css`: phase and compact resource shortcuts.
- `EnergyGenerator.tsx` / `energy-generator.css`: combined Generator, energy, and change feedback.
- `CardInspector.tsx` / `card-inspector.css`: selected artwork, current stats, and ability text.
- `cardDisplay.ts`: shared formatting for power totals and missing catalog stats.
- `ResourceZone.tsx` / `resource-zone.css`: contained damage/soul fans and per-card costs.
- `CrestZone.tsx` / `crests.css`: landscape crest tiles with explicit activation.
- `crests.ts` / `crestActions.ts`: auxiliary card identity and physical/virtual crest views.
- `GZoneTracker.tsx` / `g-zone.css`: the separate G-zone drop tray and face-up copies.
- `stride.ts`: G-unit identity, Generation Break, stride/heart association, and End return.
- `strideSelection.ts`: one G-unit placement target with an optional selected current vanguard.
- `PlaytestCard.tsx`: the shared hand and inspector card display.
- `SelectedCardActions.tsx`: the gold action bar; actions are delegated to the table.
- `useCompactInspector.ts`: the inspector breakpoint shared with the table layout.
- `useTableShortcuts.ts`: table-only Undo/clear shortcuts that respect inputs and dialogs.
- `PowerControls.tsx` / `power-controls.css`: front-row shortcut and custom effect calculator.
- `powerEffects.ts`: current field targets, manual/G-zone multipliers, and effect application.
- `CardDragPreview.tsx`: the floating drag preview and destination hint.
- `useCardDrag.ts`: pointer capture, hit testing, edge scrolling, and cancellation.
- `playtest.ts`: pure table operations, zones, checks, turns, and manual effects.
- `engine.ts`: physical card copies, shuffling, dealing, and mulligans.
- `hand-lab.css`: page and shared controls; `playtest.css`: card/interaction states.
- `tabletop.css`: resource rail, circles, piles, hand, and container-based layout.

## State and interaction contracts

Each physical card has a stable `key` built from its deck-entry ID and copy index.
Use that key for selections and movement; `cardId` identifies the shared catalog
record and may belong to several physical copies.

Table operations return a new snapshot, or the same reference for a no-op.
`HandTable.apply` records changed snapshots for undo. Keep array updates immutable
so undo can restore the exact deck order and pending checks.

Attack rests one standing front-row unit during your battle phase. It does not
reveal a card, leaving room to resolve on-attack effects. Drive check also rests
its source if used directly. A selected front-row unit takes precedence over the
last attacker; without either, the source defaults to the vanguard. Rear-guard
drive checks are always explicit manual actions. Repeated checks set rest rather
than toggling it, and preserve `attackerKey` when the revealed card goes to hand.
Leaving battle or removing the attacker clears that source. All of these actions
use the same immutable undo snapshots; drive counts and triggers remain manual.

Damage stays in arrival order; flips keep each card in place. Soul is stored
bottom-to-top, with the last copy directly beneath the active vanguard. Riding
adds the previous vanguard to that end. Charges and manual soul additions go
underneath the existing stack, preserving the covered unit. Moving the vanguard
away uncovers the last remaining soul copy, after removing all selected cards and
before inserting the outgoing card. This prevents duplication when moving into
soul itself. The uncovered unit enters standing with cleared temporary modifiers.
These are generic sandbox movements, not automatic card-specific effects.

Saved `crest` entries begin in Reserve. Legacy entries typed `Crest` or `Ride Deck
Crest` follow the same setup, even if their old deck section was Main or Other.
They never enter the opening hand, ride deck, unit circles, soul, or damage through
normal table movement. A crest can move only between Reserve and Crest; mixed
selections reject the whole move rather than moving only the other cards. Printed
card quantities remain physical copies and are conserved by every snapshot.

Deck-specific crests are optional. Activate them manually when their card effect
grants the crest, such as Nightrose's grade-one ride. Placement does not automate
the crest's power, stride restrictions, or other abilities. Crest artwork is
contained in landscape tiles, and its inspector omits unit grade/power/critical.

Every game shows a combined Energy Generator and energy control. Without a printed crest entry,
its tile is a view of `rules.tokens.energyGenerator`, with no invented card ID or
inventory copy. A printed Energy Generator replaces that virtual tile; face-up
presence in Crest is its normal activation source. The rules layer activates it on
the first normal ride, grants three energy at placement when going second, and
charges three at subsequent ride-phase entries. Manual activation and energy
adjustments remain available for correction and costs. The timing is described in the publisher's
[Energy Generator card text](https://en.cf-vanguard.com/cardlist/cardsearch/?keyword=Energy+Generator&view=text).
The previous Energy Generator checkbox is replaced by this visible crest control.

Old saves keep their rule-token flags and card locations, including every Undo
frame. Restore adds crest/G-unit identity flags from the current deck metadata.
A legacy virtual activation alongside a printed generator appears on one tile;
operating that tile explicitly returns it to physical presence semantics. No
crest effect or energy gain is replayed during recovery.

The circle draws one layer per soul copy and compresses large stacks to fit. Its
soul badge opens the browser in top-first order. The compact resource rail keeps
individual soul blasts and charges accessible. Damage is an arrival-ordered fan;
soul is a top-first fan with grade badges. Both scroll when needed and neither
creates blank slots or changes the physical card order. All moves use the same
undo and session recovery state.

Stride retains the original vanguard key in `session.stride.heartKey`. Its copy
shares the underlying stack storage but is a heart, not usable soul: use
`soulCards(session)` for browsers, counts, and costs. `heartCard(context)` supplies
the separate visual layer and name. Printed heart power is inherited once when
striding; temporary bonuses and crest-specific changes remain manual. Entering
End returns the G unit face up and restores its associated heart with the same
rest/stand orientation. An explicitly empty heart association never promotes an
unrelated soul card. Legacy snapshots without stride metadata can use only the
immediate normal predecessor as their fallback.

The G-zone tray is separate from Crests and replaces the old auxiliary G pile.
Drag a G-zone unit onto Vanguard to stride; the G browser stays open for the next
cost. Drag a face-down G copy onto the tray to turn it face up in place. Drag the
active stride back to the tray, or use **Return to G zone**, to restore its heart;
entering End performs the same return automatically. The browser is a source list,
not a cost drop target. Cost flips and a stride return are separate actions, so a
mixed selection cannot accidentally end the stride while paying another cost.

G-zone previews mirror physical copies; G units cannot enter the Crest
zone. Previously hidden G units in Crest recover face up into G in the active
game and all saved Undo frames. Derive GB through `generationBreak(context)` so only face-up G units in G
zone or Vanguard count. A typed normal unit never qualifies merely by entering
G zone. The face-up cost action is idempotent; mixed invalid selections reject
the whole action. Named-card cost requirements and opponent stride eligibility
stay manual.

Normal stride starts from a face-down G unit during Ride. The sandbox also accepts
Main and face-up G copies for correcting earlier manual actions. Selection can
contain just the G unit or that unit plus the current vanguard; placement moves
only the G unit onto Vanguard and retains the original as its linked heart.
Multiple G units or unrelated selected cards never choose an arbitrary stride.

Double-clicking a field unit toggles only that copy's rest state, including from
the zone browser. It does not attack or start a drive check. The second click
does not toggle selection again; the shortcut focuses the affected unit. Hand,
deck, and resource cards retain ordinary selection behavior. The action bar keeps
keyboard/touch alternatives and offers both 2k and 5k power adjustments.

The action bar prioritizes the selected zone's usual operations. Field units show
Attack, Retire, Rest/Stand, and positive power adjustments; damage exposes CB/CC;
soul exposes Soul Blast. The More disclosure preserves all uncommon manual edits.
Ctrl/Cmd+Z uses the existing Undo history, and Escape clears selection outside a
drag or dialog. Inputs, native selects, editable text, and other page controls
retain their keyboard behavior.

When the table has at most 1,000 pixels of content width, selected card details open from a compact dock above the
playmat into a focus-contained drawer. The wide-screen inspector stays beside the
field. A ResizeObserver follows the table's width, including navigation collapse,
and matches the CSS container query. Only one card-detail instance mounts, so artwork and ability text are not
duplicated. Closing the drawer returns focus without moving the game state.

Large piles (deck, drop, soul, bind, G zone, reserve) get a taller, viewport-bounded
browser. Smaller zones shrink to their contents. Changing zones resets the list's
scroll position without changing the game state.

Power presets and custom effects share `changePower`, which applies an integer
delta to unique copies in one snapshot. Front-row effects cover the current
vanguard and front rear-guards, regardless of rest state; later calls do not
inherit the bonus. The calculator also supports selected field units, all
rear-guards, or all field units, with custom, total G-zone, or face-up G-zone
counts. Counts are read when Apply is pressed; these are not ongoing auras.
New games start G-zone cards face down. Existing saved games keep their flags.

The +100M shortcut adds power to one selected field unit. It does not resolve
the Over Trigger's draw, removal, or additional card text. Effects remain usable
during pending drive or damage checks. All turn bonuses clear at either player's
turn boundary. Circle labels abbreviate very large totals; the tooltip and card
inspector retain the exact value. See the publisher's
[Over Trigger explanation](https://en.cf-vanguard.com/howto/d-series/).

Occupied unit circles use the card name as their visible title. Zone identifiers
remain stable for movement and drop targets, and remain in accessible labels and
tooltips. Clearing or undoing a circle restores its empty-zone title automatically.

The phase/resource HUD, prominent unit stats, and card preview take presentation
cues from the publisher's [Dear Days 2 fight screenshots](https://store.steampowered.com/app/2457540/Cardfight_Vanguard_Dear_Days_2/).
This stays a flat solo sandbox. The [rules layer](rules/README.md) handles a small
set of verified deck-specific conditions and choices; other effects and costs
remain manual. Attack and drive-check shortcuts handle the attacking unit's rest state.

Drag handlers leave the game unchanged until a valid release. The existing
`data-drop-zone` and `data-drag-scroll` attributes connect presentational components
to hit testing and edge scrolling. Keep those attributes on the same DOM elements
when changing the layout. The click handler suppresses only the click generated
after dragging; keyboard selection and the Move menu remain available.

The saved version ID, update timestamp, and refresh counter form the table's React
key. Remounting resets transient selection/drag state and restores a compatible
active game, including pending checks, resources, deck order, and up to 80 Undo
snapshots. Starting a new game replaces that tab's saved game. Merely browsing
another deck does not erase it; returning to the matching version resumes it.

Compatibility uses entry/card IDs, quantities, and deck zones, not metadata or
timestamps. Editing ability text or artwork therefore does not reset a game.
Changing the actual deck list invalidates the saved state with a short notice.
Backups contain only game data and IDs, never image bytes or catalog records.
Saving happens synchronously once per completed action, not during dragging,
selection, or rendering. If browser storage fails, memory recovery still supports
navigation and the footer reports "Saved until refresh". sessionStorage recovery
lasts for the tab session; this is not a permanent save or cross-device sync.

Run `npm run lint`, `npm test`, and `npm run build` from `frontend-web` after changes.
The tests in `../../../tests` cover card conservation, mulligans, movement,
turns, checks, card-text cleanup, and session recovery with storage failures.
