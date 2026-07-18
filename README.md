# Boil on the Bend — Registration (EWA-LA)

Vite + React registration site with Stripe checkout and a Supabase-backed
organizer roster. Deploys to Vercel as a static SPA plus three serverless
functions in `/api`.

## Stack
- Frontend: Vite + React (`src/BoilOnTheBend.jsx`)
- Payments: Stripe Checkout (`api/create-checkout-session.js`, `api/stripe-webhook.js`)
- Data: Supabase project **yellow-kite**, table `public.registrants`
- Organizer roster read/check-in: `api/registrants.js` (service role + passcode)

## Deploy to Vercel (CLI)

```bash
npm i -g vercel          # if you don't have it
cd boil-on-the-bend
vercel login
vercel link              # choose the V8 Technologies team, create project "boil-on-the-bend"
vercel                   # preview deploy
vercel --prod            # production deploy
```

Then set Environment Variables (Vercel dashboard → Project → Settings →
Environment Variables, or `vercel env add`):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://mwwvcjpyrriqhugoazag.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (secret) |
| `ORGANIZER_PASSCODE` | passphrase for door staff |
| `STRIPE_SECRET_KEY` | `sk_test_…` then `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | from the Stripe webhook you create |
| `PUBLIC_BASE_URL` | your deployed URL, e.g. `https://boil-on-the-bend.vercel.app` |

Redeploy after adding env vars so the functions pick them up.

## Turn on real payments
1. In `src/BoilOnTheBend.jsx`, set `STRIPE_CONFIG.publishableKey` to your `pk_…`
   and `STRIPE_CONFIG.liveMode = true`.
2. Stripe Dashboard → Webhooks → add `https://<your-domain>/api/stripe-webhook`
   for the `checkout.session.completed` event; copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.

## Ticketing (Phase A)

Every paid registrant now gets a **real, scannable QR ticket** (an opaque
128-bit token), shown on the confirmation screen and on a shareable ticket
page at `/?ticket=<token>`. Door staff scan tickets with the iPad camera
(Door view → **Scan tickets**), which checks people in atomically — the same
ticket can never check in twice, even from two devices at once.

### One-time setup

> **Fresh Supabase project?** Run **`db/phase-0-bootstrap.sql`** first — it
> creates the base tables (registrants, sponsors, lots, event_settings) with
> the insert-only RLS policy for the publishable key. It's a guarded no-op on
> a project that already has them, so when in doubt, run it. Full order:
> phase-0 → phase-a → phase-b → phase-c → phase-d. If you see
> `relation "registrants" does not exist`, you're either in the wrong
> Supabase project or need this bootstrap.

1. Run **`db/phase-a.sql`** in the Supabase SQL editor (Dashboard → SQL
   Editor). It adds `ticket_token` / `checked_in_at` to `registrants`, makes
   the Stripe webhook idempotent (unique `stripe_session_id`), creates the
   `ticket_scans` audit log, and backfills tokens for existing registrants —
   already-sold tickets become scannable immediately.
2. Redeploy. That's it for QR ticketing — no new env vars needed.

### How tickets flow

| Path | Where the ticket is minted |
|---|---|
| Online (Stripe) | `api/stripe-webhook.js` mints on payment; the success page fetches it via `/api/ticket?session_id=…` |
| Simulated checkout | minted in the browser, saved with the registrant |
| Cash walk-in | minted in the browser, saved with the registrant |

Scans hit `POST /api/scan` (organizer passcode required). Results —
accepted / duplicate / invalid — are logged to `ticket_scans`.

### Door iPad stations (Phase B)

Two locked, single-purpose station modes, launched from the Door view (or by
URL). Pin each iPad to Safari with iOS **Guided Access**; leaving a station
requires the organizer passcode.

- **`/?station=register`** — self-serve walk-in registration. Guests enter
  name/phone/party and either pay by card (Stripe) or choose "pay at the
  cashier", which creates a **Pending** registration with a QR ticket. The
  cashier finds them in the Door view and taps **Mark paid**; the scan
  station flashes "payment due" until then.
- **`/?station=scan`** — fullscreen ticket scanner (armed once with the
  organizer passcode). Accepted / duplicate / invalid flashes, typed-code
  fallback, per-station check-in tally.

**How check-in validates** (why nobody can check in as someone else):
self-serve check-in requires possession of the ticket QR/code — an
unguessable 128-bit token. There is no name search on any self-serve screen;
name lookup exists only in the staff Door view behind the passcode. Every
accept flashes name + party size for staff to eyeball, and every attempt is
logged in `ticket_scans`.

Run `db/phase-b.sql` once in the Supabase SQL editor (after `db/phase-a.sql`)
— it adds sponsor packages/benefits/logo storage and the lots `sale_type`
column used by the silent-auction filter.

### Offline door mode (Phase C)

The door keeps working when venue internet drops — the thing Cvent OnArrival
can't do. Run `db/phase-c.sql` once (after phase-b), and open the Door view /
stations **once while online** on each iPad; from then on:

- The page itself loads offline (service-worker app shell), and the roster
  lives in an on-device manifest (IndexedDB), refreshed on every load and
  every 2 minutes at the scan station.
- **Scans keep working offline**: validated against the manifest, queued,
  and replayed through `/api/scan-batch` when connectivity returns.
  Reconciliation is **first-scan-wins** — the server's atomic claim decides;
  if two offline devices both accepted the same ticket, staff see a conflict
  banner naming the guest (never a silent drop). Replays are idempotent
  (per-op ids), so a retried sync can't double-count or misreport.
- **Walk-ins keep working offline** (cash at the Door view, self-serve at the
  registration station): saved locally with their QR ticket — scannable on
  that device immediately — and upserted on the unique ticket token at sync,
  so a replay can never create a duplicate.
- Staff edits (check-ins, Mark paid, bidder #s) queue as idempotent patches.
- The Door view shows an offline banner with the queued-op count, last sync
  time, and a "Sync now" button; stations show a queued badge.
- A ticket sold online *after* the last sync scans as "Not in the offline
  roster — verify manually", and still reconciles to a real verdict later.
- Offline unlock only accepts the passcode the device verified while online
  (an unverified passcode can't arm a device that has no server to ask).
- Scope: each device queues its own work; devices see each other's changes
  once connectivity returns. Card payments require connectivity (Stripe).

### White-label Event Setup (Phase D)

The event's branding, copy, and pricing are **config, not code**. Open
**`/?app=setup`** (also linked in the organizer nav), connect with the
organizer passcode, and edit:

- Event name, association name, short name (used in copy), tagline, date
  label, venue, city
- Ticket name + price, suggested donation amounts
- Brand colors (primary, primary-dark, accent, background) with a live
  preview — every page derives its full palette from these four
- Logo upload (shows on the landing page, ticket pages, and organizer nav)

Empty fields fall back to the built-in Boil on the Bend defaults, so nothing
changes until you customize. Apple/Google Wallet passes pick up the event
name, org name, and colors automatically. A new customer = run the SQL, set
the env vars, fill in Event Setup — no code changes, no fork.

Run `db/phase-d.sql` once in the Supabase SQL editor (after `db/phase-c.sql`).

### Wallet passes (optional, env-gated)

The **Add to Apple Wallet / Google Wallet** buttons appear automatically once
the credentials below exist; until then the endpoints return 503 and the
buttons stay hidden. QR ticketing works fully without them.

**Apple** (`api/wallet-pass.js`) — requires an Apple Developer account:

| Variable | Value |
|---|---|
| `APPLE_PASS_TYPE_ID` | e.g. `pass.com.ewala.boilonthebend` (Identifiers → Pass Type IDs) |
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APPLE_PASS_CERT` | base64 of the pass certificate PEM |
| `APPLE_PASS_KEY` | base64 of its private key PEM |
| `APPLE_PASS_KEY_PASSPHRASE` | key passphrase (only if set) |
| `APPLE_WWDR_CERT` | base64 of [Apple WWDR G4 cert](https://www.apple.com/certificateauthority/) PEM |
| `APPLE_PASS_ICON_BASE64` | *(optional)* base64 PNG logo for the pass |

**Google** (`api/google-wallet.js`) — requires a
[Google Wallet issuer account](https://pay.google.com/business/console):

| Variable | Value |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | numeric issuer id |
| `GOOGLE_WALLET_SA_EMAIL` | service account email (Wallet Object Issuer role) |
| `GOOGLE_WALLET_SA_KEY` | base64 of the service account private key PEM |

`base64` a PEM with: `base64 -w0 cert.pem` (macOS: `base64 -i cert.pem`).

## Notes
- The Supabase **publishable** key in the frontend is insert-only via RLS — it
  cannot read the attendee list. Roster reads go through `/api/registrants`,
  protected by `ORGANIZER_PASSCODE` and the service-role key (server-only).
- Ticket lookups (`/api/ticket`, wallet endpoints) authenticate by the token
  itself — an unguessable 128-bit id — and return only what a ticket displays.
- `npm run dev` runs the frontend locally; the `/api` functions run on Vercel
  (or via `vercel dev`).
