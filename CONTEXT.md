# Forest City Vault

Ingests a Clover merchant's sales activity and presents it as store analytics
(orders, collected revenue, line-item and vendor breakdowns).

## Language

**Order**:
A single customer transaction pulled from Clover — the aggregate root that owns
its line items and payments. It is what the analytics count as one "order".
_Avoid_: Sale, purchase, transaction

**Payment**:
A tender captured (or attempted) against an Order — a child entity of the Order.
An Order may have more than one (split tender); every Payment belongs to exactly
one Order.
_Avoid_: Charge, tender, transaction

**Line Item**:
A single sold item on an Order — a child entity of the Order, carrying its price,
quantity, discounts, and refunded flag.
_Avoid_: Product line, sale item

**Collected**:
Money actually captured on an Order — the sum of its successful Payments. Distinct
from the Order's item value, which can differ when an Order is unpaid, partially
paid, refunded, or tipped.
_Avoid_: Revenue, amount, gross (each is more specific or ambiguous)

**Order status**:
The Order's payment disposition, derived from Clover's `paymentState`:
`paid`, `incomplete` (open/unpaid), `partial`, `refunded`. Analytics count and sum
only `paid` orders.
_Avoid_: Payment status

**Standalone payment**:
A Clover payment with no associated order (a manual/keyed transaction). It is
represented as a synthesized single-payment Order, preserving the rule that every
Payment belongs to an Order.
