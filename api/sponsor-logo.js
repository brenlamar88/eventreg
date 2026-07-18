// api/sponsor-logo.js
// POST { sponsorId, filename, contentType, dataBase64 } →
//   upload the logo to the public `sponsor-logos` storage bucket, then stamp
//   the sponsor row's logo_url + logo_received. Returns { ok:true, logoUrl }.
// Gated by x-organizer-key header.
const SB   = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_B64 = 2_800_000; // ≈2 MB decoded

export default async function handler(req, res) {
  if (req.headers["x-organizer-key"] !== PASS) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { sponsorId, filename, contentType, dataBase64 } = req.body || {};
    if (!sponsorId || !filename || !contentType || !dataBase64) {
      return res.status(400).json({ error: "Missing sponsorId, filename, contentType, or dataBase64" });
    }
    if (String(dataBase64).length > MAX_B64) return res.status(413).json({ error: "Logo too large (max ~2 MB)" });
    if (!ALLOWED.includes(contentType)) return res.status(415).json({ error: "Unsupported type — use PNG, JPEG, WebP, or SVG" });

    const path = `${sponsorId}-${String(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await fetch(`${SB}/storage/v1/object/sponsor-logos/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": contentType, "x-upsert": "true" },
      body: Buffer.from(dataBase64, "base64"),
    });
    if (!up.ok) {
      console.error("sponsor-logo upload error:", up.status, await up.text().catch(() => ""));
      return res.status(500).json({ error: "Upload failed" });
    }

    const logoUrl = `${SB}/storage/v1/object/public/sponsor-logos/${path}`;
    const pr = await fetch(`${SB}/rest/v1/sponsors?id=eq.${sponsorId}`, {
      method: "PATCH",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ logo_url: logoUrl, logo_received: true }),
    });
    if (!pr.ok) {
      console.error("sponsor-logo patch error:", pr.status, await pr.text().catch(() => ""));
      return res.status(500).json({ error: "Uploaded but could not update sponsor" });
    }
    return res.status(200).json({ ok: true, logoUrl });
  } catch (e) {
    console.error("sponsor-logo error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
