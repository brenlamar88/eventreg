// api/event-logo.js
// POST { filename, contentType, dataBase64 } →
//   upload the event logo to the public `event-assets` bucket, then stamp
//   event_settings.logo_url. Returns { ok:true, logoUrl }.
// Gated by x-organizer-key header. Same pattern as api/sponsor-logo.js.
import { requestedEvent } from "./event.js";
import { authorizeOrganizer } from "./auth.js";
import { writeEventSettings } from "./settings-write.js";
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_B64 = 2_800_000; // ≈2 MB decoded

export default async function handler(req, res) {
  if (!(await authorizeOrganizer(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const { filename, contentType, dataBase64 } = req.body || {};
    if (!filename || !contentType || !dataBase64) return res.status(400).json({ error: "Missing filename, contentType, or dataBase64" });
    if (String(dataBase64).length > MAX_B64) return res.status(413).json({ error: "Logo too large (max ~2 MB)" });
    if (!ALLOWED.includes(contentType)) return res.status(415).json({ error: "Unsupported type — use PNG, JPEG, WebP, or SVG" });

    const eventId = requestedEvent(req);
    const path = `logo-${eventId}-${String(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await fetch(`${SB}/storage/v1/object/event-assets/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": contentType, "x-upsert": "true" },
      body: Buffer.from(dataBase64, "base64"),
    });
    if (!up.ok) {
      console.error("event-logo upload error:", up.status, await up.text().catch(() => ""));
      return res.status(500).json({ error: "Upload failed" });
    }

    const logoUrl = `${SB}/storage/v1/object/public/event-assets/${path}`;
    const w = await writeEventSettings(eventId, { logo_url: logoUrl });
    if (!w.ok) {
      console.error("event-logo write error:", w.status, w.error);
      return res.status(500).json({ error: "Uploaded but could not update settings", detail: w.error });
    }
    return res.status(200).json({ ok: true, logoUrl });
  } catch (e) {
    console.error("event-logo error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
