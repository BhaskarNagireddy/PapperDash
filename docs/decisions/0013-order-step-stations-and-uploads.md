# ADR 0013: The order step: upload, settings, pick-up and the document's own price

- Status: Accepted (client decisions 2026-11-03)
- Date: 2026-11-03

## Context
ADR 0012 put the price at the order step: after upload, core counts the document's pages and the page-count tiers give its price. This step builds that screen. Two things it needs did not exist yet:
- a list of stations to print at or collect from;
- a way for a browser to upload when core runs without S3 (local development and CI).

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| One screen | `/sv/print` (`/en/print`), signed in, in four sections: **1. file** (choose or drop, progress, page count, when it is deleted), **2. settings** (copies, all or some pages, one- or two-sided; black and white and A4 shown as fixed), **3. pick-up** (print at the station, a locker, or delivery), **4. price**. | Everything that changes the price is on one page, next to the price. |
| The price shown is the price charged | `POST /v1/orders/quote` runs the same checks as placing the order: the customer's own processed file, its real page count, the page range, copies, the station and the price list. It returns the quote without creating an order. It works while ordering is closed and before the email is confirmed. | The customer can never see one price and be charged another. They also see their price before ordering opens. |
| Stations directory | A `stations` block. `GET /v1/stations` is public and lists open stations; `PUT /v1/admin/stations/:id` lets admins add or change one. Orders refuse a closed or unknown station (`station_unavailable`), and a locker order at a station without lockers (`no_lockers`). It starts **empty**: until the pilot station is added, the website offers only delivery and says why. | ADR 0010: every order is printed by a station, so the website must never offer a station that cannot print. |
| Uploads | In production, browsers upload straight to the encrypted S3 bucket with a presigned POST. `UPLOAD_ORIGIN` adds the bucket to the website's `connect-src`. Without S3, core's in-memory storage answers the same POST at `/v1/documents/dev-upload`. It takes a file only for the signed-in customer's own document that is still waiting for its upload, and it is 404 when S3 is configured (always in production, where core refuses to start without S3). | One upload code path in the browser. CI runs it end to end without AWS. |
| File type | Checked in the browser first, by MIME type or extension, because some systems leave Office files untyped. Core checks the content again. | Instant feedback; the server stays the authority. |
| Rejections | Each rejection reason (`encrypted`, `corrupt`, …) has its own Swedish and English text. | The customer knows what to do next. |
| Ordering closed | The price section shows the price, says ordering opens with the first station, and offers the waitlist as the screen's one primary button. With ordering open but the email not confirmed, it links to the account page instead. | ADR 0011: no order we cannot print. |
| Delivery | Shown with a note that the delivery partner charges for delivery in their own app (ADR 0006). | No surprise fee. |

## Later
- **Checkout:** a placed order is saved as a draft; paying for it with Stripe is the next step on the roadmap.
- **Colour and A3:** they appear when the price list offers them.
- **Terraform:** must set `UPLOAD_ORIGIN` and a CORS rule on the bucket allowing POST from `https://papperdash.se`.

## Tests
- **Core:** `test/order-step.e2e.test.ts`:
  - the stations directory (public list, admin only, ID format);
  - quotes from the real page count, range and copies, the 50-page limit and colour, the same price as the created order, quotes while ordering is closed, owner-only, station and locker checks;
  - the development upload (owner only, wrong key or type, single use, 404 with real storage).
- **Website, mocked API:** `e2e/print.spec.ts`, on desktop and phone:
  - sign-in redirect;
  - page count and re-pricing as copies and ranges change, and the page limit;
  - ordering closed, open, and email not confirmed;
  - no station open;
  - a rejected PDF, an unsupported type and deleting the file;
  - axe WCAG 2.2 AA, sideways scroll and 48 px targets.
- **Full stack:** `e2e/fullstack.spec.ts` uploads a real 7-page PDF through the browser. Core counts the pages, and the page shows 16 kr, then 10 kr for pages 1–3. A range past the last page is refused.
