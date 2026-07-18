// api/_lib/members.js — team management for a client org.
// ---------------------------------------------------------------------------
//   GET    ?client=<slug>                       → members + pending invites
//   POST   ?client=<slug> {email, role}         → invite a teammate (returns link)
//   POST   ?client=<slug> {action:"accept", token}  → the LOGGED-IN user accepts
//   DELETE ?client=<slug> {userId}              → remove a member
//
// Managing a team is an owner/admin action. Invites carry a role; accepting
// (as the logged-in Supabase user) creates the membership. Inviting requires
// org owner/admin (passcode or session); accepting requires a valid session.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { authorizeOrganizer } from "./auth.js";
import { requestedOrgSlug, orgBySlug } from "./org.js";
import { sessionUser } from "./session.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BASE = () => process.env.PUBLIC_BASE_URL || "";
const ROLES = ["owner", "admin", "staff", "door"];

export default async function handler(req, res) {
  const slug = requestedOrgSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing ?client=<org slug>" });
  const org = await orgBySlug(slug);
  if (!org) return res.status(404).json({ error: "Unknown organization" });

  // Accepting an invite is the one action gated by "logged in" rather than
  // "already a member" — handle it before the org-admin gate.
  if (req.method === "POST" && req.body?.action === "accept") {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first" });
    const token = String(req.body.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });
    try {
      const ir = await fetch(`${SB}/rest/v1/invitations?token=eq.${encodeURIComponent(token)}&org_id=eq.${org.id}&select=*&limit=1`, { headers: H });
      if (!ir.ok) throw new Error(`PostgREST ${ir.status}`);
      const inv = (await ir.json())[0];
      if (!inv) return res.status(404).json({ error: "Invite not found" });
      if (inv.accepted_at) return res.status(409).json({ error: "Invite already used" });
      if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: "Invite expired" });
      // Create membership (idempotent) and stamp the invite accepted.
      const mr = await fetch(`${SB}/rest/v1/memberships?on_conflict=user_id,org_id`, {
        method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: user.id, org_id: org.id, role: inv.role }),
      });
      if (!mr.ok) throw new Error(`membership ${mr.status}: ${await mr.text()}`);
      await fetch(`${SB}/rest/v1/invitations?id=eq.${inv.id}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ accepted_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true, org: org.slug, role: inv.role });
    } catch (e) {
      console.error("invite accept error:", e);
      return res.status(500).json({ error: "Could not accept invite" });
    }
  }

  // Everything else requires org owner/admin (passcode or session).
  if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const mr = await fetch(`${SB}/rest/v1/memberships?org_id=eq.${org.id}&select=user_id,role,created_at`, { headers: H });
      const members = mr.ok ? await mr.json() : [];
      // Resolve emails via the Auth admin API (best-effort).
      const withEmail = await Promise.all(members.map(async (m) => {
        let email = null;
        try {
          const ur = await fetch(`${SB}/auth/v1/admin/users/${m.user_id}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
          if (ur.ok) email = (await ur.json())?.email || null;
        } catch {}
        return { user_id: m.user_id, role: m.role, email, created_at: m.created_at };
      }));
      const invr = await fetch(`${SB}/rest/v1/invitations?org_id=eq.${org.id}&accepted_at=is.null&select=email,role,expires_at,created_at&order=created_at.desc`, { headers: H });
      const invites = invr.ok ? await invr.json() : [];
      return res.status(200).json({ members: withEmail, invites });
    }

    if (req.method === "POST") {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const role = ROLES.includes(req.body?.role) ? req.body.role : "admin";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Valid email required" });
      const token = crypto.randomBytes(24).toString("base64url");
      const r = await fetch(`${SB}/rest/v1/invitations`, {
        method: "POST", headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify({ token, email, org_id: org.id, role }),
      });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      const link = `${BASE()}/?invite=${token}&client=${encodeURIComponent(slug)}`;
      // Best-effort: ask Supabase to email a magic link to the invitee so a
      // brand-new user can sign in, then land on the accept link.
      try {
        await fetch(`${SB}/auth/v1/admin/generate_link`, {
          method: "POST", headers: { ...H },
          body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: link } }),
        });
      } catch {}
      return res.status(200).json({ ok: true, inviteLink: link });
    }

    if (req.method === "DELETE") {
      const userId = String(req.body?.userId || "").trim();
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      const r = await fetch(`${SB}/rest/v1/memberships?org_id=eq.${org.id}&user_id=eq.${userId}`, {
        method: "DELETE", headers: { ...H, Prefer: "return=minimal" },
      });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("members error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
