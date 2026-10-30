# Mixed-rarity purchase plans

Printings of the same card share its gameplay identity, but each purchase line
keeps its own target, on-hand copies, incoming copies, unit price, notes, and
artwork. Rarity does not determine a card's grade or deck zone.

## Workflow

- Open a checklist row and choose **Add printing** to increase the total target
  with another saved printing of that card.
- Choose **Split by rarity** to reassign some or all of the current target to
  another printing without increasing the card's total target.
- If copies are already owned or incoming, explicitly confirm that they stay
  with the original printing. Splitting never converts physical inventory.
- An existing destination line receives the added targets and keeps its price
  and notes. Edit that row separately to change its quote.
- Fully reassigned rows remain available with zero targets, preserving inventory
  and notes. Current-deck source rows also retain their outgoing counts.
- Printing edits cannot relabel owned, incoming, or source-deck copies, or create
  a duplicate line for a printing already in the plan. Use a split instead.

Purchase estimate is the sum of each printing's outstanding copies multiplied
by its unit price in integer cents. Incoming copies remain in the purchase
estimate until received; the **Remaining** total excludes incoming copies.
Unpriced lines are flagged and contribute zero until a quote is supplied.

## Implementation

`POST /api/acquisition-plans/:plan_id/printings` adds a printing and returns the
updated plan in one response. The original `/items` endpoint remains compatible.
Repeated additions increase targets without overwriting existing quotes or notes;
a conflicting explicit quote is rejected.

`POST /api/acquisition-plans/items/:item_id/split` accepts `printing_id`,
`quantity`, and `inventory_policy: "keep_original"`, plus an optional new-line
`unit_price_cents` and `notes`. Both target changes commit together. Archived
plans must be restored before editing.

On backend startup, the SQLite schema upgrade relaxes the tracked-quantity check
to allow zero. Existing rows, IDs, foreign keys, indexes, and triggers are retained;
replacement runs in an explicit transaction and rolls back on failure. A backend
restart is required when deploying this update. No changes are made to saved
deck versions or shared card rules.

## Regression checks

Automated coverage lives in `tests/test_acquisition_printings.py`,
`tests/test_acquisition_target_schema.py`, and the frontend order draft, printing,
and allocation tests. It includes schema upgrade rollback and repeat startup,
duplicate/collision handling, independent inventory and prices, full splits,
source-deck preservation, receipts, archive/restore, and saved draft notes.

Browser walkthrough (use disposable test plans and illustrative prices):

1. Start with four base copies at $2 each. Split one to DFR at $30. Verify the
   target stays four and the estimate becomes **$36**, with distinct artwork.
2. Reload. Verify each printing's target, quote, and notes remain intact.
3. Split all targets from a line with two on hand and one incoming. Verify the
   confirmation is required and all three copies stay on the original printing.
4. Receive that original printing's delivery. Verify the other rarity remains
   unsatisfied and the original row now has three on hand.
5. Leave a row draft unsaved. Attempt an addition through both the catalog and
   another printing's dialog; verify both protect the draft.
6. Add to an existing printing. Verify one row remains, with its quote and notes
   unchanged. In a current-deck plan, verify outgoing counts decrease correctly.
7. Mark both rarities incoming; receive only one. Verify archive stays disabled
   until every required printing is received, then archive, restore, and reload.
8. At a narrow viewport, verify the checklist and allocation dialog remain usable
   without page-level horizontal overflow.

The walkthrough was verified against an isolated in-memory database; no saved
collection or purchase-plan data was changed during development.
