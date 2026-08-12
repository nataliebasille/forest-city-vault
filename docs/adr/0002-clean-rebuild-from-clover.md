# Migrate to the Order model by clean rebuild from Clover

When re-graining from the payment-based `Sale` model to the Order aggregate
(ADR-0001), we discard the existing payment-grained snapshot rows and their
`fcv_aggregate_events` history and **re-ingest orders from Clover as the source of
truth**, rather than migrating/upcasting the stored events in place.

## Context

The stored history is grained by payment and its events do not carry a Clover
order id, so any in-place migration would still have to call Clover to discover
each payment's order — most of the complexity of a rebuild with none of the
simplicity. The current data was itself produced by a ~6-month cold-start
backfill, so it sits entirely within the window Clover still serves; a rebuild
loses nothing we actually hold.

## Decision

Rebuild: list Clover orders (`expand=payments,lineItems`) for the reachable
window, construct Order aggregates, and replace the prior payment-grained rows and
events. Treat Clover as the system of record for historical sales.

## Consequences

- Local event history before the switch is not preserved; the event store starts
  fresh at Order grain. Acceptable because Clover is the upstream source of truth
  and the prior history was itself a recent backfill.
- The rebuild only covers the window Clover serves (~6–8 months). Data older than
  that is out of reach by design and is not carried forward.
- The rebuild is a one-off, idempotent re-ingest (upsert by order id), so it can
  be re-run safely if interrupted.
