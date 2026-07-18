// api/lot-checkout.js
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout session for a single auction lot payment.
// POST body: { lotId, lotNo, description, amount, buyerName, buyerEmail, passcode }
// Returns:   { url }  — redirect the browser there
//
// On success Stripe redirects to /?app=settlement&lot_paid=<lotId>
// The stripe-webhook also marks buyer_paid=true server-side on completion.
//
// Env vars: STRIPE_SECRET_KEY, ORGANIZER_PASSCODE, (optional) NEXT_PUBLIC_SITE_URL
// ---------------------------------------------------------------------------
import Stripe from "stripe";

// Lazy init: this module is bundled into the API router, so a missing key
// must fail this route at request time, not every route at import time.
let _stripe;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const PASS   = process.env.ORGANIZER_PASSCODE;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!req.body?.passcode || req.body.passcode !== PASS) return res.status(401).json({ error: "Unauthorized" });

  const { lotId, lotNo, description, amount, buyerName, buyerEmail } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ||
    (req.headers.origin || `https://${req.headers.host}`);

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: buyerEmail || undefined,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(amount) * 100),
          product_data: {
            name: `Lot ${lotNo} — ${description || "Auction item"}`,
            description: buyerName ? `Buyer: ${buyerName}` : undefined,
          },
        },
        quantity: 1,
      }],
      metadata: {
        type: "lot",
        lotId: String(lotId),
        lotNo: String(lotNo),
        buyerName: buyerName || "",
      },
      success_url: `${origin}/?app=settlement&lot_paid=${lotId}`,
      cancel_url:  `${origin}/?app=settlement`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("lot-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
