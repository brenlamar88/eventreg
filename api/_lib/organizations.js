// api/_lib/organizations.js — manage client organizations. PLATFORM-MASTER
// only (creating orgs, listing all orgs, setting an org's passcode/plan is a
// platform action). Passcodes are write-only and never returned.
//
//   GET                     → list orgs (with has_passcode, has_stripe, event count)
//   POST  {slug,name,email} → create an org
//   PUT   ?slug=<slug>      → update {name, ownerPasscode, plan, status, contactEmail}
// ---------------------------------------------------------------------------
import { authorizeOrganizer } from "./auth.js";
import { isValidOrgSlug } from "./org.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export default async function handler(req, res) {
  // Managing organizations is always a platform-master action.
  if (!(await authorizeOrganizer(req, { masterOnly: true }))) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB}/rest/v1/organizations?select=id,slug,name,plan,status,contact_email,owner_passcode,stripe_account_id,stripe_customer_id,created_at,event_settings(event_id)&order=created_at.asc`,
        { headers: H }
      );
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      // Strip secrets; expose only booleans.
      const rows = (await r.json()).map(({ owner_passcode, stripe_account_id, stripe_customer_id, event_settings, ...o }) => ({
        ...o,
        has_passcode: !!owner_passcode,
        stripe_connected: !!stripe_account_id,
        billing_active: !!stripe_customer_id,
        event_count: Array.isArray(event_settings) ? event_settings.length : 0,
      }));
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const b = req.body || {};
      const slug = String(b.slug || "").trim().toLowerCase();
      const name = String(b.name || "").trim();
      if (!isValidOrgSlug(slug)) return res.status(400).json({ error: "Slug must be lowercase letters, numbers, dashes (start alphanumeric, ≤41 chars)" });
      if (!name) return res.status(400).json({ error: "Name is required" });
      const r = await fetch(`${SB}/rest/v1/organizations`, {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({ slug, name, contact_email: b.contactEmail || null }),
      });
      if (r.status === 409) return res.status(409).json({ error: "That slug is already taken" });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      const row = (await r.json())[0] || {};
      return res.status(200).json({ ok: true, id: row.id, slug: row.slug });
    }

    if (req.method === "PUT") {
      const slug = String(req.query?.slug || "").trim().toLowerCase();
      if (!isValidOrgSlug(slug)) return res.status(400).json({ error: "Bad slug" });
      const b = req.body || {};
      const patch = {};
      if ("name" in b) patch.name = String(b.name || "").trim() || null;
      if ("contactEmail" in b) patch.contact_email = b.contactEmail || null;
      if ("plan" in b && ["trial", "active", "paused"].includes(b.plan)) patch.plan = b.plan;
      if ("status" in b && ["active", "suspended"].includes(b.status)) patch.status = b.status;
      if ("ownerPasscode" in b) {
        const pc = String(b.ownerPasscode || "").trim();
        patch.owner_passcode = pc.length ? pc : null;   // empty clears it
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update" });
      const r = await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("organizations error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
