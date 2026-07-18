// api/google-wallet.js
// ---------------------------------------------------------------------------
// Google Wallet "Save to Wallet" link:  GET /api/google-wallet?token=<ticket_token>
// 302-redirects to https://pay.google.com/gp/v/save/<jwt>, a signed JWT that
// carries the ticket class + object inline ("fat JWT") — Google creates them
// at save time, so no Wallet REST API calls or extra dependencies are needed.
// The pass barcode encodes the same ticket_token the door scanner reads.
//
// ENV-GATED: without the service-account credentials this returns a friendly
// 503 and the app hides the button.
//
// Vercel env vars (all required to enable):
//   GOOGLE_WALLET_ISSUER_ID = numeric issuer id (Google Pay & Wallet Console)
//   GOOGLE_WALLET_SA_EMAIL  = service-account email with Wallet Object Issuer role
//   GOOGLE_WALLET_SA_KEY    = base64 of the service account's PEM private key
//   PUBLIC_BASE_URL         = https://your-site.vercel.app  (JWT origin)
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }

  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID;
  const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
  const saKeyB64 = process.env.GOOGLE_WALLET_SA_KEY;
  if (!issuer || !saEmail || !saKeyB64) {
    return res.status(503).json({
      error: "Google Wallet is not configured",
      hint: "Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_KEY in Vercel.",
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

    // White-label branding from event_settings (falls back to defaults)
    let brand = { eventName: "Boil on the Bend", primary: "#183A2F" };
    try {
      const br = await fetch(`${SB_URL}/rest/v1/event_settings?event_year=eq.2026&select=event_name,org_name,color_primary&limit=1`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      if (br.ok) {
        const row = (await br.json())[0] || {};
        brand = {
          eventName: row.event_name || brand.eventName,
          orgName: row.org_name || row.event_name || brand.eventName,
          primary: /^#[0-9a-fA-F]{6}$/.test(row.color_primary || "") ? row.color_primary : brand.primary,
        };
      }
    } catch { /* defaults stand */ }

    const eventId = t.event_id || "boil85";
    const classId = `${issuer}.${eventId}`;
    // Object ids allow only [a-zA-Z0-9._-]; base64url tokens already comply.
    const objectId = `${issuer}.${eventId}-${t.ticket_token}`;

    const claims = {
      iss: saEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [process.env.PUBLIC_BASE_URL || ""].filter(Boolean),
      payload: {
        eventTicketClasses: [
          {
            id: classId,
            issuerName: brand.orgName || brand.eventName,
            eventName: { defaultValue: { language: "en-US", value: brand.eventName } },
            reviewStatus: "UNDER_REVIEW",
            hexBackgroundColor: brand.primary,
          },
        ],
        eventTicketObjects: [
          {
            id: objectId,
            classId,
            state: "ACTIVE",
            ticketHolderName: t.name || "Guest",
            ticketNumber: t.ticket_token,
            barcode: { type: "QR_CODE", value: t.ticket_token },
            textModulesData: [{ header: "Party of", body: String(t.party || 1) }],
          },
        ],
      },
    };

    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(claims));
    const key = Buffer.from(saKeyB64, "base64").toString("utf8");
    const signature = crypto.createSign("RSA-SHA256").update(`${header}.${body}`).sign(key, "base64url");
    const jwt = `${header}.${body}.${signature}`;

    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 302;
    res.setHeader("Location", `https://pay.google.com/gp/v/save/${jwt}`);
    return res.end();
  } catch (err) {
    console.error("google-wallet error:", err);
    return res.status(500).json({ error: "Could not generate save link" });
  }
}
