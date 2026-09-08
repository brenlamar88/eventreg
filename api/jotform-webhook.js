// api/jotform-webhook.js
// ---------------------------------------------------------------------------
// Receives real-time Jotform webhook POSTs and writes to Supabase registrants.
//
// Configure in Jotform: Settings → Integrations → WebHooks → add:
//   https://eventreg-eosin.vercel.app/api/jotform-webhook
//
// Jotform sends application/x-www-form-urlencoded with fields like:
//   q3_firstName, q3_firstName[first], q4_lastName, q5_email,
//   q6_phoneNumber[full], q7_partySize, q8_ranch, ...
//
// Vercel env vars required (already set):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional — set JOTFORM_WEBHOOK_SECRET to a secret you paste into Jotform
// "Custom Header" field (X-Webhook-Secret) to block spoofed requests.
// ---------------------------------------------------------------------------

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.JOTFORM_WEBHOOK_SECRET; // optional
const TABLE = "registrants";
const EVENT_ID = "boil85";

function parseBody(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) { out[k] = v; }
  return out;
}

function getField(fields, ...keys) {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== "") return fields[key];
    for (const fk of Object.keys(fields)) {
      if (fk === key || fk.startsWith(key + "[")) {
        const val = fields[fk];
        if (val !== undefined && val !== "") return val;
      }
    }
  }
  return null;
}

function getFullName(fields) {
  const combined = getField(fields, "q3_fullName", "q3_name", "q4_fullName", "q4_name");
  if (combined) return combined;
  const first = fields["q3_firstName[first]"] || fields["q4_firstName[first]"] || getField(fields, "q3_firstName", "q4_firstName") || "";
  const last = fields["q3_firstName[last]"] || fields["q4_firstName[last]"] || getField(fields, "q3_lastName", "q4_lastName", "q5_lastName") || "";
  return [first, last].filter(Boolean).join(" ") || null;
}

function getPhone(fields) {
  for (const fk of Object.keys(fields)) {
    if (/phone/i.test(fk) && fk.includes("[full]")) return fields[fk];
  }
  let area = "", num = "";
  for (const fk of Object.keys(fields)) {
    if (/phone/i.test(fk) && fk.includes("[area]")) area = fields[fk];
    if (/phone/i.test(fk) && fk.includes("[phone]")) num = fields[fk];
  }
  if (area || num) return `${area}${num}`;
  return getField(fields, "q6_phone", "q7_phone", "q5_phone", "q8_phone");
}

function getPartySize(fields) {
  const raw = getField(fields, "q7_partySize", "q6_partySize", "q8_partySize", "q5_partySize", "q7_party", "q6_party", "q9_partySize", "q10_partySize") || getField(fields, "q7_howMany", "q6_howMany");
  const n = parseInt(raw, 10);
  return isNaN(n) ? 1 : Math.max(1, n);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = await new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });

  const fields = parseBody(raw);
  console.log("jotform-webhook fields:", JSON.stringify(fields));

  const name = getFullName(fields);
  const email = getField(fields, "q5_email", "q4_email", "q6_email", "q3_email", "q7_email", "q8_email");
  const phone = getPhone(fields);
  const ranch = getField(fields, "q8_ranch", "q9_ranch", "q6_ranch", "q7_ranch", "q10_ranch", "q8_business", "q9_business", "q8_organization", "q9_organization");
  const party = getPartySize(fields);
  const sponsorName = getField(fields, "q9_sponsor", "q10_sponsor", "q11_sponsor", "q12_sponsor", "q9_sponsorName", "q10_sponsorName");
  const submissionId = fields["submissionID"] || fields["submission_id"] || null;

  if (!name && !email) {
    return res.status(200).json({ ok: false, reason: "no_name_or_email" });
  }

  const row = {
    event_id: EVENT_ID,
    name: name || email,
    email: email || null,
    phone: phone || null,
    ranch: ranch || null,
    party,
    amount: party * 100,
    status: "pending",
    source: "jotform",
    checked_in: false,
    notes: submissionId ? `jotform:${submissionId}` : null,
    sponsor_name: sponsorName || null,
  };

  const sbHeaders = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  try {
    if (submissionId) {
      const checkRes = await fetch(
        `${SB_URL}/rest/v1/registrants?event_id=eq.${EVENT_ID}&notes=eq.jotform:${encodeURIComponent(submissionId)}&select=id`,
        { headers: sbHeaders }
      );
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    const insertRes = await fetch(`${SB_URL}/rest/v1/registrants`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify(row),
    });

    const result = await insertRes.json();
    if (!insertRes.ok) {
      console.error("jotform-webhook: supabase error:", result);
      return res.status(500).json({ error: "DB insert failed", detail: result });
    }

    return res.status(200).json({ ok: true, id: result?.[0]?.id });
  } catch (err) {
    console.error("jotform-webhook error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
