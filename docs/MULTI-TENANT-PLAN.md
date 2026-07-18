# Multi-tenant SaaS plan — many client organizations on one platform

Synthesis of the Cvent / Eventbrite / Brushfire / Stripe research into a
concrete, staged plan for turning this from "our events" into "a product many
client organizations each run their own events on."

## Where we are vs. where this goes

- **Today (Phases A–F):** one account (you) runs **many events** on one
  deployment — shared master passcode, one Stripe account, `event_id` on every
  table. This is *multi-event*, single-tenant.
- **The SaaS goal:** many **client organizations** (chapters, associations),
  each managing their own events, with their own logins, their own branding,
  and **their own bank payouts** — while you keep a platform fee. This is
  *multi-tenant*.

The good news: every table already carries `event_id`, and an event will
belong to exactly one organization, so tenant scoping mostly comes "for free"
through `event_id → org_id`.

## Recommended architecture (what the research points to)

| Decision | Recommendation | Why |
|---|---|---|
| **Data isolation** | **Pooled** — one Supabase database, `org_id` on tenant tables, enforced by Postgres **Row-Level Security** | Cheapest and lightest at 10–100 tenants; the native Supabase pattern; one migration to run. Carve out a dedicated DB only for a future enterprise client who pays for it. |
| **Tenant model** | `organization → membership(user, role) → event → registration/lot/sponsor` | Exactly how Cvent and Eventbrite structure it (Owner / Admin / Staff / Door roles). |
| **Login** | **Supabase Auth** (email + Google), users belong to orgs via a `memberships` table | Replaces the shared passcode with real accounts; door staff get a scan-only role. |
| **Tenant URL** | **Wildcard subdomains** — `chapter.yourapp.com` — resolved from the hostname | What Brushfire (the closest competitor) does; better branding; enables BYO-domain later as an upsell. Ship a path-based selector first if we need speed, behind one swappable `resolveTenant()`. |
| **Your SaaS fee** | **Stripe Billing** subscription per org (flat tier, maybe + small per-registration overage) | Predictable; defensible vs Eventbrite's per-ticket %; matches Swoogo/Bizzabo. |
| **The org's ticket/auction money** | **Stripe Connect — Express accounts + destination charges with `application_fee_amount`** | This is exactly "we collect the money, keep our fee, the org hits payout." Stripe runs the org's identity onboarding, so we carry minimal compliance. Budget the 0.25% + $0.25 per-payout Express fee into pricing. |

## Build stages (each shippable, in order)

1. **Tenancy core (DB).** ✅ DONE (Phase H, `db/phase-h.sql`). `organizations`
   table + `org_id` on events; all existing events assigned to a seeded
   "house" org; three-tier auth (platform master → org owner passcode → event
   passcode); `/api/organizations` CRUD; a **Platform Admin** screen
   (`/?app=platform`) to create client orgs and set their owner passcode.
   (Real Supabase Auth logins + `memberships`/`invitations` replace the
   passcode tiers in a later stage; the passcode model is the interim.)
2. **Auth + team.** ✅ DONE (Phase J, `db/phase-j.sql`). Supabase Auth
   magic-link login + `memberships`/`invitations`; every organizer API accepts
   a signed-in session (Bearer) OR a passcode; roles owner/admin/staff/door;
   invite teammates by email from Platform Admin. Additive — passcodes still
   work. Still open: enforcing Postgres RLS by membership on the data tables
   (today the service role mediates all access behind the authorize check),
   and per-role gating finer than "any membership authorizes the org."
3. **Org console + onboarding.** Self-serve signup → create org → invite team
   (owner/admin/staff/door) → "create your first event." An org-level dashboard
   above the per-event console.
4. **Tenant routing.** Wildcard `*.yourapp.com` in Vercel; middleware maps
   subdomain (or a custom domain via a `domains` table) → `org_id`, verified
   server-side from the Host header. One `resolveTenant()` so subdomain ↔ path
   is swappable; BYO-domain as a later upsell.
5. **Billing.** ✅ DONE (Phase I, `db/phase-i.sql`). Stripe Connect Express
   onboarding per org + destination charges with an application fee on
   registration checkout (their revenue → their payout, minus your fee);
   Stripe Billing subscription per org (your flat fee). Managed on the
   Platform Admin screen; env-gated on `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID`.
   Still open: routing auction lot-checkout through Connect too, and
   subscription-status webhooks for real-time billing state.

Stages 1–2 are the foundation and are mostly additive/reversible. Stages 4–5
carry real business decisions (pricing model, subdomains, Connect) and some
one-way-door choices — those are where I need your calls before building.

## Decisions I need from you before building the tenant layer

1. **Pricing model** — flat monthly/annual SaaS fee per org, a small % / per-
   registration platform fee on their ticket sales, or both? (Drives Billing +
   Connect application-fee design.)
2. **Money flow** — do you want the platform to **collect all ticket/auction
   money and pay out to each org** (Stripe Connect Express — recommended, matches
   your call), or should each org connect their **own** Stripe account and you
   never touch their funds (Standard)? This is the biggest one.
3. **Tenant URLs** — wildcard subdomains (`chapter.yourapp.com`) now, or start
   with a path/param selector and add subdomains later?
4. **Signup** — self-serve (anyone can create an org and start) or invite-only
   / sales-assisted while you're onboarding the first chapters by hand?

Once you answer these, stages 1–2 can start immediately (they don't depend on
3–5), and I'll sequence the rest behind your pricing/money decisions.

## Note on the current passcode model

Phases D–F (white-label config, per-event passcodes) are the single-tenant
precursor to this. Under real multi-tenancy, the **master passcode becomes an
org-scoped owner login**, and per-event passcodes remain as the lightweight
door-staff credential. Nothing built so far is wasted — it graduates into the
tenant model.
