// api/_lib/billing.js — your SaaS subscription fee, charged to each client org
// via Stripe Billing. Separate from Connect (that's the org's own revenue).
//
//   GET  ?client=<slug>                    → { status }  (subscription status)
//   POST ?client=<slug> {action:"subscribe"} → { url }   (Checkout, subscription mode)
//   POST ?client=<slug> {action:"portal"}    → { url }   (Stripe billing portal)
//
// ENV-GATED: needs STRIPE_SECRET_KEY and STRIPE_PRICE_ID (the recurring Price
// you create in your Stripe dashboard for your plan). Without them → 503.
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

export default async function handler(req, res) {
  const s = stripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!s || !priceId) return res.status(503).json({ error: "Billing is not configured", hint: "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in Vercel." });

  if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });
  const slug = requestedOrgSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing ?client=<org slug>" });
  const org = await orgBySlug(slug);
  if (!org) return res.status(404).json({ error: "Unknown organization" });

  try {
    // Ensure the org has a Stripe customer.
    const ensureCustomer = async () => {
      if (org.stripe_customer_id) return org.stripe_customer_id;
      const c = await s.customers.create({ name: org.name, email: org.contact_email || undefined, metadata: { org_slug: slug } });
      await patchOrg(slug, { stripe_customer_id: c.id });
      return c.id;
    };

    if (req.method === "GET") {
      if (!org.stripe_customer_id) return res.status(200).json({ status: null });
      const subs = await s.subscriptions.list({ customer: org.stripe_customer_id, status: "all", limit: 1 });
      const status = subs.data[0]?.status || null;
      if (status !== org.subscription_status) await patchOrg(slug, { subscription_status: status });
      return res.status(200).json({ status });
    }

    if (req.method === "POST") {
      const action = req.body?.action;
      const customer = await ensureCustomer();
      if (action === "portal") {
        const portal = await s.billingPortal.sessions.create({ customer, return_url: `${BASE()}/?app=platform` });
        return res.status(200).json({ url: portal.url });
      }
      // default: subscribe
      const session = await s.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${BASE()}/?app=platform&billing=done&client=${encodeURIComponent(slug)}`,
        cancel_url: `${BASE()}/?app=platform&client=${encodeURIComponent(slug)}`,
        metadata: { org_slug: slug },
      });
      return res.status(200).json({ url: session.url });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("billing error:", e);
    return res.status(500).json({ error: e.message || "Billing error" });
  }
}
