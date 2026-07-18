// api/_lib/event-config.js
// ---------------------------------------------------------------------------
// The white-label, multi-event configuration. "An event" is an event_settings
// row keyed by its slug (event_id).
//
//   GET  ?event=<id>   → PUBLIC. That event's branding row ({} if none;
//                        NULL fields = built-in defaults). With no event
//                        param, resolves the DEFAULT event (is_default row,
//                        else 'boil85').
//   GET  ?list=1       → ORGANIZER-GATED. All events:
//                        [{event_id, event_name, event_year, is_default}].
//   PUT  ?event=<id>   → ORGANIZER-GATED partial upsert. A PUT to a new slug
//                        CREATES the event. Extra fields: eventYear (int),
//                        isDefault (true → this event becomes the default).
// ---------------------------------------------------------------------------
import { requestedEvent, isValidSlug, DEFAULT_EVENT, urlParam } from "./event.js";
import { authorizeOrganizer } from "./auth.js";
import { writeEventSettings } from "./settings-write.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Only these ever leave the server on the public GET (lot_fee etc. stay private).
const PUBLIC_COLS = [
  "event_id", "event_name", "org_name", "org_short", "tagline", "date_label", "venue", "city",
  "ticket_name", "ticket_price", "donation_presets", "logo_url",
  "color_primary", "color_primary_dark", "color_accent", "color_background",
].join(",");

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
      // Organizer event list — a cross-event view, so MASTER key only.
      if (req.query?.list || urlParam(req, "list")) {
        if (!(await authorizeOrganizer(req, { masterOnly: true }))) return res.status(401).json({ error: "Unauthorized" });
        const r = await fetch(
          `${SB}/rest/v1/event_settings?select=event_id,event_name,event_year,is_default,organizer_passcode&order=is_default.desc,event_year.desc,event_id.asc`,
          { headers: H }
        );
        if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
        // Never leak the passcode value — only whether one is set.
        const rows = (await r.json()).filter((row) => row.event_id).map(({ organizer_passcode, ...row }) => ({
          ...row, has_passcode: !!organizer_passcode,
        }));
        return res.status(200).json(rows);
      }

      // Public branding for one event. No explicit param → the default event.
      const explicit = String(req.query?.event || "").trim().toLowerCase();
      let rows = [];
      if (explicit) {
        if (!isValidSlug(explicit)) return res.status(400).json({ error: "Bad event id" });
        const r = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(explicit)}&select=${PUBLIC_COLS}&limit=1`, { headers: H });
        if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
        rows = await r.json();
      } else {
        const r = await fetch(`${SB}/rest/v1/event_settings?is_default=is.true&select=${PUBLIC_COLS}&limit=1`, { headers: H });
        if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
        rows = await r.json();
        if (!rows.length) {
          const r2 = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${DEFAULT_EVENT}&select=${PUBLIC_COLS}&limit=1`, { headers: H });
          if (r2.ok) rows = await r2.json();
        }
      }
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(rows[0] || {});
    }

    if (req.method === "PUT") {
      const eventId = requestedEvent(req);
      const b = req.body || {};

      // Does this event already exist? Creating a new event, changing the
      // default, or setting a passcode are platform actions (MASTER key);
      // editing an existing event's branding accepts that event's own key.
      const existsR = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}&select=event_id&limit=1`, { headers: H });
      if (!existsR.ok) throw new Error(`PostgREST ${existsR.status}: ${await existsR.text()}`);
      const exists = (await existsR.json()).length > 0;
      const wantsPrivileged = !exists || b.isDefault === true || "organizerPasscode" in b;
      if (!(await authorizeOrganizer(req, { masterOnly: wantsPrivileged }))) {
        return res.status(401).json({ error: "Unauthorized" });
      }

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
      if ("eventYear" in b) {
        const y = parseInt(b.eventYear, 10);
        if (!isFinite(y) || y < 2000 || y > 2100) return res.status(400).json({ error: "eventYear must be a 4-digit year" });
        patch.event_year = y;
      }
      // Per-event passcode (write-only; never returned by any GET). Empty
      // string clears it (that event falls back to the master key).
      if ("organizerPasscode" in b) {
        const pc = String(b.organizerPasscode || "").trim();
        patch.organizer_passcode = pc.length ? pc : null;
      }
      const makeDefault = b.isDefault === true;
      if (!Object.keys(patch).length && !makeDefault) return res.status(400).json({ error: "Nothing to update" });

      const w = await writeEventSettings(eventId, patch);
      if (!w.ok) {
        console.error("event-config write failed:", w.status, w.error);
        return res.status(500).json({ error: "Could not save settings", detail: w.error });
      }

      if (makeDefault) {
        // Exactly one default: clear the flag everywhere, then set it here.
        const clear = await fetch(`${SB}/rest/v1/event_settings?is_default=is.true`, {
          method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ is_default: false }),
        });
        if (!clear.ok) throw new Error(`PostgREST ${clear.status}: ${await clear.text()}`);
        const set = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}`, {
          method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ is_default: true }),
        });
        if (!set.ok) throw new Error(`PostgREST ${set.status}: ${await set.text()}`);
      }
      return res.status(200).json({ ok: true, eventId });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("event-config error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
