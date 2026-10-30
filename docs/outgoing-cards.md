# Outgoing cards in purchase plans

The checklist describes the next build. A full cut (`target_quantity == 0` and
`removed_quantity > 0`) appears in the compact **Outgoing** area above it. Partial
cuts remain in the checklist with their original → target comparison.
**All cards**, search, and archived plans retain access to every line.

## Removal actions

- **Mark removed** confirms that the outgoing copies were physically taken out
  of this deck. It does not change the target, ownership, or incoming orders.
- **Undo confirmation** clears that confirmation and returns the cut to review.
  The target stays unchanged.
- **Restore to build** restores the source quantity as the target and clears
  removal confirmation. It does not create physical copies or alter inventory.
- **Details / Review incoming** opens the saved printing's quantities and notes.
  Opening or closing a section has no effect on removal state.

Confirmed full cuts with no incoming orders move into collapsed **Removed
history**. Incoming copies remain flagged even after a physical removal has
been confirmed. Receive them or explicitly edit the incoming count if an order
was canceled; confirmation never resolves a delivery. Outstanding incoming copies
continue to prevent plan archival.

Confirmation is tracked by quantity. If two cuts were confirmed and the target
changes to cut three, only the additional copy is pending. Shrinking a cut clamps
its confirmation count; restoring all source copies clears the confirmation.
Printing splits and repeated printing additions follow the same rules.

## Totals and persistence

Ownership remains the actual number on hand. Progress and readiness use only
copies applied to each printing's target. Outgoing lines do not inflate grade
summaries, Ready/Needs counts, or next-build bulk selection. Partial cuts may be
Ready for their retained target while also having removal work to confirm.
Incoming orders and their value remain visible independently of purchase work.

The API stores `confirmed_removed_quantity` and `removal_confirmed_at`, and derives
`pending_removed_quantity`. New summary fields separate active lines, outgoing
lines, and confirmed/pending removals; the existing total `line_count` is retained.
SQLite receives the new columns on backend startup. Reload and archive/restore
preserve printing identity, source/target counts, quotes, notes, and confirmation.
Saved deck versions are never changed by these actions.

`POST /api/acquisition-plans/items/:id/removal` accepts one action:
`confirm`, `undo_confirmation`, or `restore_target`. It returns the updated plan.
Archived plans must be restored before any mutation.

**Delete tracking line** is for an erroneous line without source-deck history.
The API rejects permanent line deletion when source or outgoing quantities are
present. Genuine deck cuts use the reversible removal workflow instead.

## Regression coverage

Backend coverage: `tests/test_acquisition_outgoing.py` exercises full and partial
cuts, confirmation/reversal, target changes, printing splits/re-additions,
incoming receipts, source-deck preservation, archive recovery, protected deletion,
invalid requests, and repeatable legacy schema upgrades.

Frontend coverage: `frontend-web/tests/order-views.test.ts` exercises checklist,
search, Ready/Needs/Incoming filters, next-build bulk eligibility, archived access,
and zero-target rows retained by printing splits.

Manual browser regression scenarios use disposable in-memory plans:

1. Cut two source copies to zero. Verify a compact 2 → 0 row in Outgoing and no
   normal ready row or bulk checkbox for it in the purchase checklist.
2. Reduce four copies to two. Verify the row remains active and counts as Ready
   when two or more matching copies are on hand, with two outgoing separately.
3. Mark removed, undo confirmation, and restore to build. Verify the first two
   preserve the target, while restoring changes it back to the source count.
4. Confirm a cut with incoming copies. Verify the warning remains; review and
   receive the delivery through the nested dialog without changing its target.
5. Reload, archive, restore, and reload again. Verify full and partial removal
   confirmations, selected printing, notes, and owned/incoming counts survive.
6. Leave a row draft open, then close Details. Verify it remains recoverable and
   removal actions stay disabled until the draft is saved or discarded.
7. Verify new-build plans and narrow layouts retain usable purchase controls.

Temporary QA frontends use an independent Vite `cacheDir`, so their dependency
optimization cannot replace the cache used by the user's development server.
