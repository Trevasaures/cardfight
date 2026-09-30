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
- `BattleStatus.tsx` / `battle-status.css`: phase, resource shortcuts, and manual energy.
- `CardInspector.tsx` / `card-inspector.css`: selected artwork, current stats, and ability text.
- `cardDisplay.ts`: shared formatting for power totals and missing catalog stats.
- `ResourceZone.tsx`: ordered damage and soul cards, per-card costs, and soul charge.
- `PlaytestCard.tsx`: the shared hand and inspector card display.
- `SelectedCardActions.tsx`: the gold action bar; actions are delegated to the table.
- `PowerControls.tsx` / `power-controls.css`: front-row shortcut and custom effect calculator.
- `powerEffects.ts`: current field targets, manual/G-zone multipliers, and effect application.
- `CardDragPreview.tsx`: the floating drag preview and destination hint.
- `useCardDrag.ts`: pointer capture, hit testing, edge scrolling, and cancellation.
- `playtest.ts`: pure table operations, zones, checks, turns, and manual effects.
- `engine.ts`: physical card copies, shuffling, dealing, and mulligans.
- `hand-lab.css`: page and shared controls; `playtest.css`: table layout and interaction states.

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

The circle draws one layer per soul copy and compresses large stacks to fit. Its
soul badge opens the browser in top-first order. The separate resource tray keeps
individual soul blasts and charges accessible. Six empty damage slots are visual
guides, not a game limit. All moves use the same undo and session recovery state.

Double-clicking a field unit toggles only that copy's rest state, including from
the zone browser. It does not attack or start a drive check. The second click
does not toggle selection again; the shortcut focuses the affected unit. Hand,
deck, and resource cards retain ordinary selection behavior. The action bar keeps
keyboard/touch alternatives and offers both 2k and 5k power adjustments.

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
