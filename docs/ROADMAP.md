# Product Roadmap — from the founders' call (July 2026)

Every feature discussed on the call, mapped to what exists, what shipped in
which PR, and what's planned. The product thesis from the call: **a complete
package — registration + sponsorships + auctions — priced under Cvent, for
the local chapters of big associations** (DSC/CCA-style chapters that get the
brand but not the budget). Cvent has no auction module and weak sponsorship
tooling; that triplet is the wedge.

## Shipped

### Phase A — Ticketing spine (PR #39)
- Real QR tickets (128-bit tokens), minted on every payment path
- Public ticket page `/?ticket=<token>`, Apple/Google Wallet passes (env-gated)
- Camera scan check-in in the Door view; atomic `/api/scan` (accepted /
  duplicate / invalid), `ticket_scans` audit log
- Stripe webhook idempotency (redelivery can't duplicate a registrant)

### Phase B — Door stations + sponsor packages + silent auction (this PR)
- **Two iPad station modes** (from the call: "one for non-registered…
  the other for scanning a QR code or typing it in"):
  - `/?station=register` — self-serve walk-in registration kiosk: name/phone/
    party → pay by card (Stripe) or "pay at the cashier" (Pending status,
    cashier gets a one-tap **Mark paid** button in the Door view)
  - `/?station=scan` — fullscreen scanner armed with the organizer passcode;
    big accepted/duplicate/invalid flashes; typed-code fallback
  - Pin each iPad with iOS Guided Access; exiting a station needs the passcode
- **Check-in validation** (the "Joe Blow types three letters of a name"
  question from the call — answered by design):
  1. Self-serve check-in requires *possession of the ticket* — the QR or its
     code, an unguessable 128-bit token. **No name search exists on any
     self-serve screen**, so you cannot check in as someone else by name.
  2. Name search lives only in the staff Door view, behind the organizer
     passcode.
  3. Every scan accept flashes name + party size so a greeter can eyeball
     that a party of 2 isn't walking six people in.
  4. Every scan attempt is logged (`ticket_scans`) — disputes are auditable.
  This is stronger than Cvent OnArrival's kiosk defaults, and worth saying in
  sales conversations.
- **Sponsor packages, designed exactly as scoped on the call**: create the
  packages FIRST (name, price, description, structured benefits), then add
  sponsors into packages. Each sponsor gets a **benefits delivery checklist**
  ("5 registrations ✓, full-page ad ✓, 1 table …") seeded from their package,
  a **logo upload** (stored in Supabase Storage), pledged vs. paid vs.
  balance, and CSV **template import/export** of packages ("fill out the
  spreadsheet and go to town").
- **Silent vs. live auction separation**: every lot is Live or Silent;
  filter pills + SILENT badges in settlement; exports carry a Sale Type
  column.

## Planned next (in order)

### Phase C — Offline door (already researched, next build)
IndexedDB ticket manifest + queued scan/mutation outbox + batch
reconciliation (first-scan-wins, conflicts surfaced), service-worker app
shell. Beats Cvent OnArrival, which cannot do offline walk-ins. Also fixes
the index-based mutation races found in review.

### Phase D — White-label admin ("make it stupid simple to replicate")
The call's CMS idea, done as config-not-code (no per-customer forks, no
custom builds to maintain):
- `event_settings` grows into full event config: event name, association
  name, logo, brand colors, date/venue, ticket price(s), donation presets
- An admin "Event Setup" screen edits it; every page reads theme + copy from
  it (the pine/gold system becomes the default theme, not a hardcode)
- One deployment serves many events/orgs — new customer = new config row,
  which is what makes "replicate it quickly to wherever" true, and what keeps
  the "our Ukraine guys customizing every group" nightmare from happening
- Multi-event support falls out of this (event_id is already on every table)

### Phase E — Money engine: consignor/buyer invoicing + payouts
From the call: "day after the event, Jake Davis has 10 purchases — can he pay
online?" and "we collect all the money, our fee stays in, they hit Payout."
- Post-event **invoice links**: each buyer/consignor gets a tokenized
  statement page (same pattern as ticket pages) listing their lots, payable
  by card via Stripe Checkout; webhook marks lots paid (no more URL-trusted
  `lot_paid` — that defect dies here)
- **Platform-collects, operator-pays-out** = **Stripe Connect** (Standard or
  Express accounts). This is the exact product Stripe built for "hold the
  event's money, keep our platform fee + contractual %, operator hits
  payout." We must NOT hand-roll fund holding — moving other people's money
  outside Connect crosses into money-transmitter licensing. Connect gives us:
  application fees per charge, automatic splits, operator-controlled payouts,
  1099-K handling.
- Integer-cents settlement math, property-tested (already built and tested in
  the eventreg-demo repo, ready to port), replacing float math in the browser

### Phase F — Go-to-market assets (after a name is chosen)
- Landing page with demo booking + email capture, logo, socials
- In-app "Powered by ___" once the name exists
- Demo mode already exists (`?demo=true`) — the sales demo is one URL

## Standing cautions

- **Raffles**: the settlement module has a "Raffle" *category label* for
  EWA's books, and that's as far as we go. Louisiana (La. R.S. 4:707, 14:90)
  and most states license charitable raffles separately — we deliberately
  build no raffle sales, drawing, or ticketing features. If a customer asks,
  it's a category label for money they raised outside the platform.
- **SponsorCX** (call homework): worth studying for sponsor-side UX
  (proposals, fulfillment tracking, renewals). Our Phase B checklist covers
  fulfillment; proposals/renewals are the parts we'd study before building.
- **Pricing research** (call homework): get a Cvent demo quote; pull EWA
  contracts; target list = chapters of national associations (DSC, CCA, …)
  that self-fund their events.
