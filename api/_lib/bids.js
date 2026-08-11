// api/_lib/bids.js — silent-auction mobile bidding.
// ---------------------------------------------------------------------------
//   GET   ?event=<id>                 → PUBLIC. Auction items + live state
//                                       (public fields only; no consignor /
//                                       financials).
//   POST  ?event=<id>                 → PUBLIC. Place a proxy bid.
//         { lotId, bidderNo, name, maxAmount }
//         The bidder number + name are verified against the event roster so
//         nobody can bid under someone else's paddle. The atomic place_bid()
//         DB function does the proxy math + anti-snipe extension.
//   POST  { action:'finalize', lotId }→ ORGANIZER. Close an item and push the
//                                       winner into the settlement ledger.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORGANIZER_PASSCODE
// ---------------------------------------------------------------------------
import { requestedEvent, isValidSlug } from "./event.js";
import { authorizeOrganizer } from "./auth.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Only these leave the server on the public GET — never consignor, buyer,
// commission, net, or the bid history.
const PUBLIC_COLS = [
  "id", "lot_no", "description", "auction_category", "image_url",
  "starting_bid", "min_increment", "current_bid", "high_bidder_no",
  "bid_close_at", "bidding_open", "bid_count",
].join(",");

const clip = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
  try {
    const ev = requestedEvent(req);
    if (!isValidSlug(ev)) return res.status(400).json({ error: "Bad event id" });

    // --- PUBLIC: browse the auction ---------------------------------------
    if (req.method === "GET") {
      const url =
        `${SB}/rest/v1/lots?event_id=eq.${encodeURIComponent(ev)}` +
        `&or=(bidding_open.eq.true,bid_close_at.not.is.null)` +
        `&select=${PUBLIC_COLS}&order=bid_close_at.asc.nullslast,lot_no.asc`;
      const r = await fetch(url, { headers: H });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ items: await r.json(), server_time: new Date().toISOString() });
    }

    if (req.method === "POST") {
      const b = req.body || {};

      // --- ORGANIZER: finalize (close + settle) ---------------------------
      if (b.action === "finalize") {
        if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });
        if (!b.lotId) return res.status(400).json({ error: "Missing lotId" });
        const r = await fetch(`${SB}/rest/v1/rpc/finalize_lot`, {
          method: "POST", headers: H, body: JSON.stringify({ p_lot_id: b.lotId }),
        });
        const out = await r.json();
        return res.status(r.ok ? 200 : 500).json(out);
      }

      // --- PUBLIC: place a bid --------------------------------------------
      const bidderNo = clip(b.bidderNo, 40);
      const name = clip(b.name, 200);
      const maxAmount = Number(b.maxAmount);
      if (!b.lotId) return res.status(400).json({ error: "Missing item" });
      if (!bidderNo) return res.status(400).json({ error: "Enter your bidder number" });
      if (!name) return res.status(400).json({ error: "Enter your name" });
      if (!isFinite(maxAmount) || maxAmount <= 0) return res.status(400).json({ error: "Enter a valid maximum bid" });

      // Verify the paddle belongs to this attendee: bidder number must exist
      // on the roster and the name must match. Use the roster's canonical
      // contact info for the bid (never the client's), so a paddle can't be
      // spoofed with someone else's number.
      const rr = await fetch(
        `${SB}/rest/v1/registrants?event_id=eq.${encodeURIComponent(ev)}` +
        `&bidder_number=eq.${encodeURIComponent(bidderNo)}&select=name,email,phone&limit=1`,
        { headers: H }
      );
      if (!rr.ok) throw new Error(`PostgREST ${rr.status}: ${await rr.text()}`);
      const reg = (await rr.json())[0];
      if (!reg) return res.status(403).json({ error: "That bidder number isn't registered for this event" });
      const norm = (s) => String(s || "").trim().toLowerCase();
      const a = norm(name), full = norm(reg.name);
      const nameOk = full && (full === a || full.includes(a) || a.includes(full) ||
        a.split(/\s+/).some((w) => w.length > 1 && full.includes(w)));
      if (!nameOk) return res.status(403).json({ error: "Name doesn't match that bidder number" });

      const r = await fetch(`${SB}/rest/v1/rpc/place_bid`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          p_lot_id: b.lotId,
          p_bidder_no: bidderNo,
          p_bidder_name: reg.name,
          p_bidder_email: reg.email || null,
          p_bidder_phone: reg.phone || null,
          p_max_amount: maxAmount,
        }),
      });
      if (!r.ok) throw new Error(`RPC ${r.status}: ${await r.text()}`);
      const out = await r.json();
      return res.status(out && out.ok ? 200 : 400).json(out);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("bids error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
