// api/square-webhook.js
// ---------------------------------------------------------------------------
// Listens for Square `payment.updated` events and marks the matching auction
// lot paid in Supabase. Source of truth for online lot payments — fires even
// if the buyer never returns to the settlement page.
//
// SETUP
//   1. Square Developer Dashboard → your app → Webhooks → Add subscription
//        URL:    https://your-site.vercel.app/api/square-webhook
//        Event:  payment.updated
//      Copy the subscription's Signature Key → SQUARE_WEBHOOK_SIGNATURE_KEY.
//   2. Vercel env vars:
//        SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, SQUARE_LOCATION_ID,
//        SQUARE_WEBHOOK_SIGNATURE_KEY, (optional) SQUARE_WEBHOOK_URL,
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// SIGNATURE: Square signs with HMAC-SHA256 over (notificationURL + rawBody),
// base64-encoded, in header `x-square-hmacsha256-signature`. Verifying needs
// the RAW body, so this reads the stream directly and never touches req.body.
//
// MAPPING: lot-checkout puts the lot id in the order's reference_id. A paid
// payment carries an order_id; we fetch the order to read reference_id, then
// PATCH that lot. Marking buyer_paid=true is idempotent, so Square's redeliver
// is a harmless no-op.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { squareFetch } from "./_lib/square.js";

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verify(rawBody, signature, url, key) {
  if (!signature || !key) return false;
  const expected = crypto.createHmac("sha256", key).update(url + rawBody.toString("utf8")).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }

  const raw = await readRawBody(req);
  const url = process.env.SQUARE_WEBHOOK_URL || `https://${req.headers.host}/api/square-webhook`;
  if (!verify(raw, req.headers["x-square-hmacsha256-signature"], url, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)) {
    return res.status(400).send("Webhook signature failed");
  }

  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).send("Bad JSON"); }

  if (event?.type !== "payment.updated") return res.status(200).json({ received: true, ignored: event?.type });

  const payment = event?.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED" || !payment.order_id) {
    return res.status(200).json({ received: true, ignored: "not a completed payment" });
  }

  // Fetch the order to read the lot id we stashed in reference_id at checkout.
  const ord = await squareFetch(`/v2/orders/${encodeURIComponent(payment.order_id)}`);
  const lotId = ord.body?.order?.reference_id;
  if (!ord.ok || !lotId) {
    console.error("square-webhook: could not resolve lot from order", payment.order_id, ord.status);
    return res.status(200).json({ received: true, ignored: "no lot reference" });
  }

  const amountPaid = (payment.amount_money?.amount || 0) / 100;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}`, {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ buyer_paid: true, amount_paid: amountPaid, square_payment_id: payment.id }),
    });
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
  } catch (err) {
    console.error("square-webhook: Supabase lot patch failed:", err);
    // 500 → Square retries; the PATCH is idempotent so the retry is safe.
    return res.status(500).json({ received: true, stored: false });
  }

  return res.status(200).json({ received: true });
}
