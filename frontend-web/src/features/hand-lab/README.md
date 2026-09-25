# Hand Lab developer notes

Hand Lab runs a temporary solo game from a saved deck version. The page loads the
deck data; the table never writes its practice state back to the API.

## Where to make changes

- `../../pages/HandLab.tsx`: deck/version loading, remembered selection, and table reset.
- `HandTable.tsx`: session state, undo history, selection, and coordination of the UI.
- `PlaytestZone.tsx`: circles and piles, including the top card and unit stats.
- `PlaytestCard.tsx`: the shared hand and inspector card display.
- `SelectedCardActions.tsx`: the gold action bar; actions are delegated to the table.
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

Drag handlers leave the game unchanged until a valid release. The existing
`data-drop-zone` and `data-drag-scroll` attributes connect presentational components
to hit testing and edge scrolling. Keep those attributes on the same DOM elements
when changing the layout. The click handler suppresses only the click generated
after dragging; keyboard selection and the Move menu remain available.

The saved version ID, update timestamp, and refresh counter form the table's React
key. Switching the source remounts the table and clears its temporary session.

Run `npm run lint`, `npm test`, and `npm run build` from `frontend-web` after changes.
The tests in `../../../tests` cover card conservation, mulligans, movement,
turns, checks, and card-text cleanup.
