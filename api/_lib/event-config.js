// api/event-config.js
// ---------------------------------------------------------------------------
// The white-label event configuration.
//
//   GET  → PUBLIC (no key). Returns the event_settings row's branding/copy/
//          pricing columns — everything a guest-facing page needs to render.
//          NULL fields mean "use the built-in default" and are resolved
//          client-side in src/eventConfig.js.
//   PUT  → organizer-gated (x-organizer-key). Partial update from the Event
//          Setup screen; upserts on event_year so it works even before the
//          seed row exists.
// ---------------------------------------------------------------------------

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Only these ever leave the server on the public GET (lot_fee etc. stay private).
const PUBLIC_COLS = [
  "event_name", "org_name", "org_short", "tagline", "date_label", "venue", "city",
  "ticket_name", "ticket_price", "donation_presets", "logo_url",
  "color_primary", "color_primary_dark", "color_accent", "color_background",
].join(",");

// camelCase body field → column, with light validation where it matters.
const FIELDS = {
  eventName: "event_name",
  orgName: "org_name",
  orgShort: "org_short",
  tagline: "tagline",
  dateLabel: "date_label",
  venue: "venue",
  city: "city",
  ticketName: "ticket_name",
  logoUrl: "logo_url",
};
const COLOR_FIELDS = {
  colorPrimary: "color_primary",
  colorPrimaryDark: "color_primary_dark",
  colorAccent: "color_accent",
  colorBackground: "color_background",
};
const HEX = /^#[0-9a-fA-F]{6}$/;

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const r = await fetch(`${SB}/rest/v1/event_settings?event_year=eq.${YEAR}&select=${PUBLIC_COLS}&limit=1`, { headers: H });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(rows[0] || {});
    }

    if (req.method === "PUT") {
      if (!req.headers["x-organizer-key"] || req.headers["x-organizer-key"] !== PASS) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const b = req.body || {};
      const patch = {};
      for (const [k, col] of Object.entries(FIELDS)) {
        if (k in b) patch[col] = b[k] === "" ? null : (b[k] ?? null);
      }
      for (const [k, col] of Object.entries(COLOR_FIELDS)) {
        if (k in b) {
          if (b[k] && !HEX.test(b[k])) return res.status(400).json({ error: `${k} must be a #rrggbb hex color` });
          patch[col] = b[k] || null;
        }
      }
      if ("ticketPrice" in b) {
        const n = Number(b.ticketPrice);
        if (b.ticketPrice !== null && b.ticketPrice !== "" && (!isFinite(n) || n < 0)) {
          return res.status(400).json({ error: "ticketPrice must be a non-negative number" });
        }
        patch.ticket_price = b.ticketPrice === "" || b.ticketPrice === null ? null : n;
      }
      if ("donationPresets" in b) {
        const arr = Array.isArray(b.donationPresets) ? b.donationPresets.map(Number).filter((n) => isFinite(n) && n > 0) : null;
        patch.donation_presets = arr && arr.length ? arr : null;
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update" });
      patch.updated_at = new Date().toISOString();

      const r = await fetch(`${SB}/rest/v1/event_settings?on_conflict=event_year`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ event_year: YEAR, ...patch }),
      });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("event-config error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
