// api/_lib/lot-checkout.js
// ---------------------------------------------------------------------------
// Creates a Square hosted checkout (Payment Link) for a single auction lot.
// POST body: { lotId, lotNo, description, amount, buyerName, buyerEmail, passcode }
// Returns:   { url }  — redirect the browser there
//
// The lot id rides along as the order's reference_id so the webhook can map the
// completed payment back to the lot. On success Square redirects the buyer to
// /?app=settlement&lot_paid=<lotId> (appending its own order/transaction ids),
// and api/square-webhook.js marks buyer_paid=true server-side — the real source
// of truth, since it fires even if the buyer never returns to the page.
//
// Env: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, SQUARE_LOCATION_ID,
//      ORGANIZER_PASSCODE, (optional) NEXT_PUBLIC_SITE_URL
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { authorizeOrganizerKey } from "./auth.js";
import { squareFetch } from "./square.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  // Passcode arrives in the body here (not the header) — master key or the
  // requested event's own passcode both authorize.
  if (!(await authorizeOrganizerKey(req, req.body?.passcode))) return res.status(401).json({ error: "Unauthorized" });

  const { lotId, lotNo, description, amount, buyerName } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (!lotId) return res.status(400).json({ error: "Missing lotId" });
  if (!process.env.SQUARE_LOCATION_ID) return res.status(500).json({ error: "SQUARE_LOCATION_ID not set" });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ||
    (req.headers.origin || `https://${req.headers.host}`);

  try {
    const { ok, status, body } = await squareFetch("/v2/online-checkout/payment-links", {
      method: "POST",
      body: {
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: process.env.SQUARE_LOCATION_ID,
          // reference_id is how the webhook finds the lot again (≤ 40 chars; a
          // lot uuid is 36). metadata is a human-readable backstop.
          reference_id: String(lotId),
          line_items: [{
            name: `Lot ${lotNo} — ${description || "Auction item"}`,
            quantity: "1",
            base_price_money: { amount: Math.round(Number(amount) * 100), currency: "USD" },
            note: buyerName ? `Buyer: ${buyerName}` : undefined,
          }],
          metadata: { type: "lot", lotId: String(lotId), lotNo: String(lotNo ?? "") },
        },
        checkout_options: {
          redirect_url: `${origin}/?app=settlement&lot_paid=${lotId}`,
        },
      },
    });
    if (!ok) {
      const msg = body?.errors?.[0]?.detail || `Square ${status}`;
      console.error("lot-checkout (square) error:", status, body);
      return res.status(502).json({ error: msg });
    }
    const url = body?.payment_link?.url;
    if (!url) return res.status(502).json({ error: "Square returned no checkout url" });
    return res.status(200).json({ url });
  } catch (err) {
    console.error("lot-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
