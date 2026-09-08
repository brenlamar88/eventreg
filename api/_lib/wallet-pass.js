// api/wallet-pass.js
// ---------------------------------------------------------------------------
// Apple Wallet pass for a ticket:  GET /api/wallet-pass?token=<ticket_token>
// Streams a signed .pkpass whose QR encodes the same ticket_token the door
// scanner reads — one ticket, three forms (screen QR, wallet pass, email).
//
// ENV-GATED: without the Apple certificates this returns a friendly 503 and
// the app simply hides the button. Nothing else in Phase A depends on it.
//
// Vercel env vars (all required to enable):
//   APPLE_PASS_TYPE_ID      = pass.com.yourdomain.boilonthebend   (Apple Developer → Identifiers)
//   APPLE_TEAM_ID           = 10-char Team ID
//   APPLE_PASS_CERT         = base64 of the pass-type certificate PEM
//   APPLE_PASS_KEY          = base64 of its private key PEM
//   APPLE_PASS_KEY_PASSPHRASE = key passphrase (omit if none)
//   APPLE_WWDR_CERT         = base64 of Apple WWDR G4 intermediate cert PEM
//                             (https://www.apple.com/certificateauthority/)
// ---------------------------------------------------------------------------

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 58x58 solid-pine PNG (generated, brand color #183A2F). Apple requires an
// icon.png in every pass; replace via APPLE_PASS_ICON_BASE64 for a real logo.
const FALLBACK_ICON =
  "iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAATUlEQVR4nO3OQQ0AMAgEMGTgYv/5FzYL+x0kTSqg1fcsUvGB7hi6urq6urq6urppurq6urq6urq6abq6urq6urq6umm6urq6urq6uj8egXuffz+vBMcAAAAASUVORK5CYII=";

// White-label branding from event_settings (Event Setup screen); falls back
// to the built-in defaults when unset or unreachable.
const BRAND_DEFAULTS = { eventName: "Boil on the Bend", orgName: "Boil on the Bend", primary: "#183A2F", accent: "#C9A24D" };
async function getBranding(eventId) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId || "boil85")}&select=event_name,org_name,color_primary,color_accent&limit=1`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    if (!r.ok) return BRAND_DEFAULTS;
    const row = (await r.json())[0] || {};
    return {
      eventName: row.event_name || BRAND_DEFAULTS.eventName,
      orgName: row.org_name || row.event_name || BRAND_DEFAULTS.orgName,
      primary: row.color_primary || BRAND_DEFAULTS.primary,
      accent: row.color_accent || BRAND_DEFAULTS.accent,
    };
  } catch { return BRAND_DEFAULTS; }
}
function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return "rgb(24,58,47)";
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

function walletEnv() {
  const { APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT, APPLE_PASS_KEY, APPLE_WWDR_CERT } = process.env;
  if (!APPLE_PASS_TYPE_ID || !APPLE_TEAM_ID || !APPLE_PASS_CERT || !APPLE_PASS_KEY || !APPLE_WWDR_CERT) return null;
  return {
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    teamIdentifier: APPLE_TEAM_ID,
    signerCert: Buffer.from(APPLE_PASS_CERT, "base64"),
    signerKey: Buffer.from(APPLE_PASS_KEY, "base64"),
    signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    wwdr: Buffer.from(APPLE_WWDR_CERT, "base64"),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }

  const cfg = walletEnv();
  if (!cfg) {
    return res.status(503).json({
      error: "Apple Wallet is not configured",
      hint: "Set APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT, APPLE_PASS_KEY, APPLE_WWDR_CERT in Vercel.",
    });
  }

  // Availability probe (the app decides whether to render the button)
  if (req.query?.probe) return res.status(200).json({ configured: true });

  const token = (req.query?.token || "").trim();
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/registrants?ticket_token=eq.${encodeURIComponent(token)}&select=name,party,event_id,ticket_token&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: "Ticket not found" });
    const t = rows[0];

    const { PKPass } = await import("passkit-generator");
    const brand = await getBranding(t.event_id);

    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: cfg.passTypeIdentifier,
      teamIdentifier: cfg.teamIdentifier,
      serialNumber: t.ticket_token,
      organizationName: brand.orgName,
      description: `${brand.eventName} — Admission`,
      backgroundColor: hexToRgb(brand.primary),
      foregroundColor: "rgb(247,243,233)",
      labelColor: hexToRgb(brand.accent),
      eventTicket: {
        primaryFields: [{ key: "event", label: "EVENT", value: brand.eventName }],
        secondaryFields: [
          { key: "name", label: "NAME", value: t.name || "Guest" },
          { key: "party", label: "PARTY OF", value: String(t.party || 1) },
        ],
      },
    };

    const icon = Buffer.from(process.env.APPLE_PASS_ICON_BASE64 || FALLBACK_ICON, "base64");
    const pass = new PKPass(
      {
        "pass.json": Buffer.from(JSON.stringify(passJson)),
        "icon.png": icon,
        "icon@2x.png": icon,
      },
      {
        wwdr: cfg.wwdr,
        signerCert: cfg.signerCert,
        signerKey: cfg.signerKey,
        signerKeyPassphrase: cfg.signerKeyPassphrase,
      }
    );
    pass.setBarcodes({
      message: t.ticket_token,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    });

    const buf = pass.getAsBuffer();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", 'attachment; filename="boil-on-the-bend.pkpass"');
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (err) {
    console.error("wallet-pass error:", err);
    return res.status(500).json({ error: "Could not generate pass" });
  }
}
