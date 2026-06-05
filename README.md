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

## Notes
- The Supabase **publishable** key in the frontend is insert-only via RLS — it
  cannot read the attendee list. Roster reads go through `/api/registrants`,
  protected by `ORGANIZER_PASSCODE` and the service-role key (server-only).
- `npm run dev` runs the frontend locally; the `/api` functions run on Vercel
  (or via `vercel dev`).
