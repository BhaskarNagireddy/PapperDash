# ADR 0010: Every order is fulfilled by an unattended PapperDash station

- Status: Accepted (client decisions 2026-10-12)
- Date: 2026-10-12

## Context
Before building the website's order screen, we had to settle how orders are fulfilled before stations exist: a staffed pickup point, a delivery partner, or both. The client chose neither option on its own. **There is no staffed point.** Every order is printed by a PapperDash station: a self-service machine with a printer, an output tray and storage lockers. Delivery partners collect from the station's lockers.

## Decision

### Three ways to get a printout

| Who | Choice | Order states |
| --- | --- | --- |
| At the station (walk-up) | Picks the station on the website or app, prints, takes it from the **output tray** | Paid → Queued → Printing → Printed → Collected → Completed |
| At the station, or online, collecting it themselves | Printed, packed and **moved into a locker** of that station | … → Printed → Ready → Collected → Completed |
| Online, delivered | Printed, packed and put in a locker; a **delivery partner's rider** (Foodora, Uber, …) collects it and delivers | … → Printed → ReadyForCourier → OutForDelivery → Delivered → Completed |

### Opening a locker
- **Customer:**
  1. The station screen shows a QR code. The customer scans it with the app or website while signed in, which proves they are standing at the station.
  2. They tap "Open my locker". The screen and the phone show the locker number, and the door opens.
  3. The screen reminds them to close the door. Closing it marks the order **Collected**.
  - The app can never open a locker remotely without that scan.
- **Delivery rider:**
  1. On the station screen, the rider taps "I'm collecting for a delivery" and enters the order's courier code. The code is single-use and hashed at rest, and failed attempts are rate-limited.
  2. The screen shows the locker number and the door opens.
  3. Closing the door marks the order **OutForDelivery** ("A courier has collected your order").
  4. The partner's delivery confirmation marks it **Delivered**.

### Unclaimed lockers
- Customers get reminders at 24 h and 44 h.
- After **48 h** the order goes to **SupportRequired** and staff empty the locker.
- No refund, because the order was printed. The document follows the normal retention rule.

### Ratings
- Every **Completed** order asks for **1–5 stars and an optional comment**, in the app, on the website and by email.
- Ratings are stored per order, visible to staff in the admin console, and never shown publicly.

### Before the first station exists
papperdash.se launches as **information and a waitlist**: prices, how it works, and sign-up. Ordering runs end to end on staging against the station simulator. Public ordering switches on when the pilot station is installed.

## Consequences
- **Launch depends on the pilot station hardware:** the printer, packing, lockers with door sensors, and the screen.
- **Planned work** for the stations and lockers block:
  - the locker "open" and "door closed" events;
  - customer locker opening via station QR;
  - rider codes;
  - the 48 h hold timer;
  - allowing "store in a locker" for an order placed at the station. Today a station session may only order walk-up.
- **New small block:** ratings (contracts, table, API, admin view). Notifications send the rating request.
- **Website:**
  - The order screen offers: print here (output tray), store in a locker at a chosen station, or delivery.
  - Order tracking shows: Printing, Printed, In locker / Waiting for courier, Collected by courier, Delivered.
