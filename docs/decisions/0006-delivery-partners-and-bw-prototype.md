# ADR 0006: Delivery through partner apps; black-and-white prototype

- Status: Accepted (client decision 2026-09-27)
- Date: 2026-09-27
- Supersedes: the "own riders" decision in the README and the delivery-fee field in the pricing block

## Decision
1. **Delivery is done by delivery partners' platforms** (for example Wolt, Foodora, Bolt or Budbee). The partner's app quotes the delivery fee from the pickup station to the customer's address and charges it to the customer. PapperDash prices and charges **printing only**, and hands the printed order over to the partner's courier.
2. **The prototype prints black and white only.** Colour is switched off in the price list (`colourTiers: null`), and colour orders are refused with a clear message. Switching colour on later is an admin price-list change, not a code change.

## Consequences
- The pricing block has no delivery fee. Quotes contain one printing line.
- The delivery block becomes an integration block: one `CourierProvider` adapter per partner, which requests a pickup and tracks it. Courier hand-over at the station (token, correct locker only) is unchanged.
- Which partner to integrate first is an open question: it depends on their API access and commercial terms.
