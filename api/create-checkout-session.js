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
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const { email, lineItems, party, eventId, name, phone, source, walkin } = req.body || {};
    const successUrl = `${process.env.PUBLIC_BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}${walkin ? "&walkin=1" : ""}`;
    const cancelUrl = `${process.env.PUBLIC_BASE_URL}/?status=cancelled${walkin ? "&walkin=1" : ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      phone_number_collection: { enabled: true },
      line_items: (lineItems || []).map((li) => ({
        price_data: { currency: "usd", product_data: { name: li.name }, unit_amount: li.amount },
        quantity: li.quantity || 1,
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        eventId: eventId || "boil85",
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
