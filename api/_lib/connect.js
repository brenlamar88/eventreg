// api/_lib/connect.js — Stripe Connect (Express) payouts for client orgs.
// ---------------------------------------------------------------------------
// Two roles:
//   1. Route handler for /api/connect — org owner (or platform master) sets up
//      and checks their payout account.
//        GET  ?client=<slug>                 → { connected, payoutsEnabled, detailsSubmitted }
//        POST ?client=<slug> {action:"onboard"} → { url }  (Stripe onboarding link)
//   2. chargeRouting(eventId) — used by checkout to route a payment to the
//      event's org (destination charge + application fee), or null to keep the
//      money on the platform (default event / org not onboarded).
//
// ENV-GATED: needs STRIPE_SECRET_KEY (a platform account with Connect enabled).
// Without it, the route returns 503 and chargeRouting() returns null so
// checkout behaves exactly as before.
// ---------------------------------------------------------------------------
import Stripe from "stripe";
import { authorizeOrganizer } from "./auth.js";
import { requestedOrgSlug, orgBySlug } from "./org.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BASE = () => process.env.PUBLIC_BASE_URL || "";

let _stripe;
const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
};

async function patchOrg(slug, patch) {
  await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
}

// Default platform fee if an org has none set. e.g. PLATFORM_FEE_PCT=0.05
const DEFAULT_PCT = () => Number(process.env.PLATFORM_FEE_PCT || 0) || 0;
const DEFAULT_FLAT = () => parseInt(process.env.PLATFORM_FEE_FLAT_CENTS || "0", 10) || 0;

// For a paid checkout of `amountCents`, resolve where the money goes.
// Returns null (money stays on platform) unless the event's org has a
// payouts-enabled connected account.
export async function chargeRouting(eventId, amountCents) {
  if (!stripe()) return null;
  try {
    const r = await fetch(
      `${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}&select=organizations(stripe_account_id,stripe_payouts_enabled,platform_fee_pct,platform_fee_flat_cents)&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!r.ok) return null;
    const org = (await r.json())[0]?.organizations;
    if (!org || !org.stripe_account_id || !org.stripe_payouts_enabled) return null;
    const pct = org.platform_fee_pct != null ? Number(org.platform_fee_pct) : DEFAULT_PCT();
    const flat = org.platform_fee_flat_cents != null ? Number(org.platform_fee_flat_cents) : DEFAULT_FLAT();
    const fee = Math.max(0, Math.round(amountCents * pct) + flat);
    // Never let the fee meet or exceed the charge.
    const application_fee_amount = Math.min(fee, Math.max(0, amountCents - 1));
    return { destination: org.stripe_account_id, application_fee_amount };
  } catch { return null; }
}

export default async function handler(req, res) {
  const s = stripe();
  if (!s) return res.status(503).json({ error: "Stripe is not configured", hint: "Set STRIPE_SECRET_KEY (Connect-enabled) in Vercel." });

  // Org owner (of ?client=<slug>) or platform master.
  if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });
  const slug = requestedOrgSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing ?client=<org slug>" });
  const org = await orgBySlug(slug);
  if (!org) return res.status(404).json({ error: "Unknown organization" });

  try {
    if (req.method === "GET") {
      if (!org.stripe_account_id) return res.status(200).json({ connected: false, payoutsEnabled: false, detailsSubmitted: false });
      const acct = await s.accounts.retrieve(org.stripe_account_id);
      const payoutsEnabled = !!acct.payouts_enabled && !!acct.charges_enabled;
      // Cache the readiness so checkout can route without a Stripe round-trip.
      if (payoutsEnabled !== org.stripe_payouts_enabled) await patchOrg(slug, { stripe_payouts_enabled: payoutsEnabled });
      return res.status(200).json({ connected: true, payoutsEnabled, detailsSubmitted: !!acct.details_submitted });
    }

    if (req.method === "POST") {
      let acctId = org.stripe_account_id;
      if (!acctId) {
        const acct = await s.accounts.create({
          type: "express",
          email: org.contact_email || undefined,
          business_profile: { name: org.name },
          metadata: { org_slug: slug },
        });
        acctId = acct.id;
        await patchOrg(slug, { stripe_account_id: acctId });
      }
      const link = await s.accountLinks.create({
        account: acctId,
        refresh_url: `${BASE()}/?app=platform&connect=refresh&client=${encodeURIComponent(slug)}`,
        return_url: `${BASE()}/?app=platform&connect=done&client=${encodeURIComponent(slug)}`,
        type: "account_onboarding",
      });
      return res.status(200).json({ url: link.url });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("connect error:", e);
    return res.status(500).json({ error: e.message || "Stripe Connect error" });
  }
}
