// api/create-checkout-session.js
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for Boil on the Bend, then the app
// redirects the buyer to Stripe's hosted page. The paid registrant is recorded
// in Supabase by api/stripe-webhook.js (not here) so it survives even if the
// buyer closes the tab before returning.
//
//   npm i stripe
//   Vercel env:  STRIPE_SECRET_KEY = sk_test_… / sk_live_…
//                PUBLIC_BASE_URL   = https://your-site.vercel.app
// ---------------------------------------------------------------------------
import Stripe from "stripe";
import { chargeRouting } from "./connect.js";
// Lazy init: this module is bundled into the API router, so a missing key
// must fail this route at request time, not every route at import time.
let _stripe;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const { email, lineItems, party, eventId, name, phone, source, walkin } = req.body || {};
    const evId = eventId || "boil85";
    const successUrl = `${process.env.PUBLIC_BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}${walkin ? "&walkin=1" : ""}`;
    const cancelUrl = `${process.env.PUBLIC_BASE_URL}/?status=cancelled${walkin ? "&walkin=1" : ""}`;

    const items = (lineItems || []).map((li) => ({
      price_data: { currency: "usd", product_data: { name: li.name }, unit_amount: li.amount },
      quantity: li.quantity || 1,
    }));

    // If the event's org has a payouts-enabled Connect account, make this a
    // destination charge: money lands on the org's account minus our platform
    // fee. Otherwise it stays on the platform (unchanged behavior).
    const total = items.reduce((sum, i) => sum + i.price_data.unit_amount * (i.quantity || 1), 0);
    const routing = await chargeRouting(evId, total);

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      phone_number_collection: { enabled: true },
      line_items: items,
      ...(routing ? {
        payment_intent_data: {
          application_fee_amount: routing.application_fee_amount,
          transfer_data: { destination: routing.destination },
        },
      } : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        eventId: evId,
        party: String(party || 1),
        source: source || "Online",
        checkedIn: walkin ? "true" : "false",
        name: name || "",
        phone: phone || "",
      },
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ error: "Unable to create checkout session." });
  }
}
