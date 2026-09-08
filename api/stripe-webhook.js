// api/stripe-webhook.js
// ---------------------------------------------------------------------------
// Listens for `checkout.session.completed` and writes the paid registrant into
// the Supabase `registrants` table. Source of truth for online sales — fires
// even if the buyer never returns to the success page.
//
// SETUP
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//        URL:    https://your-site.vercel.app/api/stripe-webhook
//        Event:  checkout.session.completed
//      Copy the signing secret → set STRIPE_WEBHOOK_SECRET in Vercel.
//   2. Vercel env vars:
//        STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// NOTE: Stripe signature verification needs the RAW request body, so this
// function reads the stream directly and never touches req.body.
//
// Idempotency: Stripe redelivers webhooks. The insert is an upsert keyed on
// the unique stripe_session_id (db/phase-a.sql), so a redelivery is a no-op
// instead of a duplicate paid registrant.
//
// Ticketing: every paid registrant is minted a ticket_token — an opaque
// 128-bit base64url id. The QR code encodes this token; /api/scan redeems it
// at the door; /api/ticket lets the success page retrieve it.
// ---------------------------------------------------------------------------
import Stripe from "stripe";
import crypto from "node:crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature failed: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;

    // Lot payment — mark buyer_paid on the lot
    if (s.metadata?.type === "lot" && s.metadata?.lotId) {
      try {
        const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/lots?id=eq.${s.metadata.lotId}`, {
          method: "PATCH",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ buyer_paid: true, amount_paid: (s.amount_total || 0) / 100 }),
        });
        if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      } catch (err) {
        console.error("Supabase lot patch (webhook) failed:", err);
        return res.status(500).json({ received: true, stored: false });
      }
      return res.status(200).json({ received: true });
    }

    // Registration payment — upsert the paid registrant + mint their ticket
    const row = {
      event_id: s.metadata?.eventId || "boil85",
      name: s.metadata?.name || s.customer_details?.name || null,
      email: s.customer_email || s.customer_details?.email || null,
      phone: s.metadata?.phone || s.customer_details?.phone || null,
      party: parseInt(s.metadata?.party || "1", 10),
      source: s.metadata?.source || "Online",
      status: "Paid",
      amount: (s.amount_total || 0) / 100,
      stripe_session_id: s.id,
      checked_in: s.metadata?.checkedIn === "true",
      ticket_token: crypto.randomBytes(16).toString("base64url"),
    };
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/registrants?on_conflict=stripe_session_id`,
        {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            // ignore-duplicates: a redelivered webhook leaves the original row
            // (and its ticket_token) untouched instead of erroring or rewriting.
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        }
      );
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
    } catch (err) {
      console.error("Supabase upsert (webhook) failed:", err);
      // 500 → Stripe retries; the upsert makes the retry safe.
      return res.status(500).json({ received: true, stored: false });
    }
  }

  return res.status(200).json({ received: true });
}
