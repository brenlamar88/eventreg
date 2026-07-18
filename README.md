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
