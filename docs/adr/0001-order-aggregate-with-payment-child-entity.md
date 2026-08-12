# Order is the aggregate root; Payment and Line Item are child entities

We ingest Clover data grained by **Order**, not by Payment. The event-sourced
aggregate (currently `Sale`, one row per Clover payment) is renamed to `Order`,
and both **Payment** and **Line Item** become child entities within the Order
aggregate boundary. Payment is deliberately **not** its own aggregate root.

## Context

The read models count and sum sales, but the business measures **orders** and
**collected** money — two different denominators (Clover's dashboard shows both
"Orders" and "Amount Collected" separately). Grained by payment, the model
mis-counts: a single order paid by split tender appears as two "sales", and there
is nowhere to record an order's true collected total, its `paymentState`, or
per-item refunds. Verified against production July data: 168 paid orders vs 170
paid payments, because two orders each carried two payments.

## Decision

- **Order** is the event-sourced aggregate root — the consistency boundary for a
  transaction's line items and payments.
- **Payment** and **Line Item** are child entities of Order.
- An Order's `Order status` and `Collected` total are **derived from its
  Payments** and maintained atomically within the aggregate.
- Every Payment belongs to exactly one Order; a Clover standalone payment is
  represented as a synthesized single-payment Order.

## Considered options

- **Payment as its own aggregate root** — rejected. A Payment has no lifecycle
  independent of its Order, is never loaded or mutated outside the Order context,
  and the invariant "collected = sum(payments), status = f(payments)" would then
  span two aggregates and require eventual consistency for no benefit.
- **Keep the payment-grained `Sale` aggregate and add a distinct order id** —
  rejected. It leaves a "Sale means payment but also sort of an order" model that
  still can't represent split tender, partial payment, or refunds cleanly.

## Consequences

- The stored aggregate type in the event store changes `Sale` → `Order`, and
  event names/payloads gain child Payment events; legacy `SaleRecorded` /
  `SaleItemRecorded` history must be upcast or migrated.
- Ingestion switches from listing Clover payments to listing Clover orders
  (`expand=payments,lineItems`); the import watermark axis becomes the order's
  `modifiedTime` because orders are mutable.
- The read model denormalizes `collected` onto the Order snapshot and counts/sums
  only `paid` orders — no `count(distinct)` needed once a row is an Order.
