import React, { useState, useEffect } from "react";
import { Building2, Plus, Database, AlertTriangle, Check, KeyRound, CreditCard, Link2, Users, Trash2, Copy } from "lucide-react";
import { getAdminKey, setAdminKey } from "./eventConfig.js";
import { getUser, authHeaders, signOut, onAuthChange } from "./authClient.js";
import LoginPanel from "./LoginPanel.jsx";

/* ============================================================================
   Platform Admin — /?app=platform
   ----------------------------------------------------------------------------
   The super-admin (that's you) manages CLIENT ORGANIZATIONS: create an org,
   set its owner passcode, see its event count and Stripe status. Gated by the
   PLATFORM MASTER passcode (env ORGANIZER_PASSCODE). This is the top of the
   tenancy tree: organization → events → registrations.
   ========================================================================== */

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const money0 = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--bone2:#EBE3D4;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .pa{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;}
    .serif{font-family:'Fraunces',Georgia,serif;}
    .wrap{max-width:1000px;margin:0 auto;padding:0 22px;}
    .head{background:linear-gradient(160deg,var(--pine),var(--pine2));color:#EAF1EC;}
    .head-in{padding:30px 0;}
    .eyebrow{font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--goldSoft);font-weight:700;}
    .head h1{font-family:'Fraunces',serif;font-size:32px;font-weight:600;margin:8px 0 0;}
    .head .sub{color:#A9C0B5;font-size:14px;margin-top:4px;}
    .panel{padding:24px 0 90px;}
    .settings{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end;}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
    .pwd{font-family:inherit;font-size:13px;padding:8px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;width:170px;}
    .btn{font-family:inherit;font-weight:700;font-size:13.5px;border-radius:10px;cursor:pointer;padding:9px 15px;display:inline-flex;align-items:center;gap:8px;border:1.5px solid transparent;background:var(--pine);color:#fff;}
    .btn:hover{background:var(--pine2);} .btn:disabled{opacity:.4;cursor:not-allowed;}
    .btn.ghost{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn.sm{font-size:12px;padding:6px 11px;}
    .addcard{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:20px;margin-bottom:22px;}
    .addhdr{font-family:'Fraunces',serif;font-size:17px;font-weight:600;display:flex;align-items:center;gap:9px;margin-bottom:14px;}
    .fgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;}
    .f{display:flex;flex-direction:column;gap:5px;}
    .f label{font-size:11.5px;font-weight:600;color:#4a463d;}
    .f input{font-family:inherit;font-size:13.5px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;width:100%;}
    .f input:focus{border-color:var(--pine);}
    .span3{grid-column:span 3;}.span4{grid-column:span 4;}.span5{grid-column:span 5;}.span6{grid-column:span 6;}
    @media(max-width:760px){.span3,.span4,.span5,.span6{grid-column:span 12;}}
    .hint{font-size:12.5px;color:var(--inkSoft);display:flex;align-items:center;gap:7px;}
    .org{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:12px;}
    .org-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
    .org-name{font-family:'Fraunces',serif;font-size:18px;font-weight:600;}
    .org-slug{font-size:12px;color:var(--inkSoft);font-family:ui-monospace,monospace;}
    .chips{display:flex;gap:6px;flex-wrap:wrap;}
    .chip{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;}
    .chip.ok{background:#e4f0e9;color:var(--ok);} .chip.no{background:var(--bone2);color:var(--inkSoft);}
    .org-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;}
    .empty{background:var(--paper);border:1.5px dashed var(--line);border-radius:14px;padding:40px 20px;text-align:center;color:var(--inkSoft);}
  `}</style>
);

export default function PlatformAdmin() {
  const [key, setKey] = useState(getAdminKey());
  const [db, setDb] = useState("idle"); // idle | loading | live | offline
  const [msg, setMsg] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({ slug: "", name: "", contactEmail: "" });
  const [formErr, setFormErr] = useState("");
  const [pcEdit, setPcEdit] = useState({}); // slug -> passcode input
  const [user, setUser] = useState(null);   // real login (Supabase); alt to passcode
  const [showLogin, setShowLogin] = useState(false);

  // Signed-in session takes precedence; otherwise fall back to the passcode.
  // The server accepts either the Bearer session or the x-organizer-key header.
  const authedHeaders = async () => ({
    "Content-Type": "application/json",
    ...(user ? await authHeaders() : { "x-organizer-key": key }),
  });
  // Header-only variant for GETs (no JSON body).
  const readHeaders = async () => (user ? await authHeaders() : { "x-organizer-key": key });

  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      const r = await fetch("/api/organizations", { headers: await readHeaders() });
      if (!r.ok) throw new Error(r.status === 401 ? (user ? "This account isn't a platform admin." : "Wrong platform passcode.") : `Error ${r.status}`);
      setOrgs(await r.json());
      if (!user) setAdminKey(key);
      setDb("live");
    } catch (e) { setDb("offline"); setMsg(e.message); }
  };

  // Load any existing real-login session, and auto-connect once known.
  useEffect(() => {
    getUser().then((u) => { if (u) { setUser(u); setShowLogin(false); } });
    const { data } = onAuthChange((session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  // Connect on mount when a credential is already available (passcode or session).
  useEffect(() => {
    if (db === "idle" && (getAdminKey() || user)) connect();
    // eslint-disable-next-line
  }, [user]);

  const refresh = async () => {
    try { const r = await fetch("/api/organizations", { headers: await readHeaders() }); if (r.ok) setOrgs(await r.json()); } catch {}
  };

  const createOrg = async () => {
    setFormErr("");
    const slug = form.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) { setFormErr("Slug: lowercase letters, numbers, dashes; start alphanumeric; ≤41 chars."); return; }
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    try {
      const r = await fetch("/api/organizations", { method: "POST", headers: await authedHeaders(), body: JSON.stringify({ slug, name: form.name.trim(), contactEmail: form.contactEmail.trim() || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setForm({ slug: "", name: "", contactEmail: "" });
      await refresh();
    } catch (e) { setFormErr(e.message); }
  };

  const savePasscode = async (slug) => {
    const pc = (pcEdit[slug] || "").trim();
    try {
      const r = await fetch(`/api/organizations?slug=${encodeURIComponent(slug)}`, { method: "PUT", headers: await authedHeaders(), body: JSON.stringify({ ownerPasscode: pc }) });
      if (r.ok) { setPcEdit((p) => ({ ...p, [slug]: "" })); await refresh(); }
    } catch {}
  };

  // Stripe Connect (payouts) + Billing (your subscription). Both env-gated on
  // the server — a friendly message shows if Stripe isn't configured yet.
  const [busySlug, setBusySlug] = useState("");
  const stripeAction = async (slug, path) => {
    setBusySlug(slug + path);
    try {
      const r = await fetch(`/api/${path}?client=${encodeURIComponent(slug)}`, { method: "POST", headers: await authedHeaders(), body: JSON.stringify({}) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) { setMsg(j.hint || "Stripe isn't configured yet."); return; }
      if (!r.ok) { setMsg(j.error || `Error ${r.status}`); return; }
      if (j.url) window.location.href = j.url;  // Stripe-hosted onboarding / checkout
    } catch (e) { setMsg(e.message); }
    finally { setBusySlug(""); }
  };

  // ---- Team management (per org) -------------------------------------------
  const [teamOpen, setTeamOpen] = useState({});   // slug -> bool
  const [team, setTeam] = useState({});           // slug -> { members, invites }
  const [teamMsg, setTeamMsg] = useState({});     // slug -> string
  const [inviteForm, setInviteForm] = useState({}); // slug -> { email, role }
  const [inviteLink, setInviteLink] = useState({}); // slug -> link

  const loadTeam = async (slug) => {
    setTeamMsg((m) => ({ ...m, [slug]: "" }));
    try {
      const r = await fetch(`/api/members?client=${encodeURIComponent(slug)}`, { headers: await readHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setTeamMsg((m) => ({ ...m, [slug]: j.error || `Error ${r.status}` })); return; }
      setTeam((t) => ({ ...t, [slug]: { members: j.members || [], invites: j.invites || [] } }));
    } catch (e) { setTeamMsg((m) => ({ ...m, [slug]: e.message })); }
  };

  const toggleTeam = (slug) => {
    setTeamOpen((o) => {
      const next = !o[slug];
      if (next && !team[slug]) loadTeam(slug);
      if (next && !inviteForm[slug]) setInviteForm((f) => ({ ...f, [slug]: { email: "", role: "staff" } }));
      return { ...o, [slug]: next };
    });
  };

  const sendInvite = async (slug) => {
    const f = inviteForm[slug] || { email: "", role: "staff" };
    if (!f.email.trim()) return;
    setTeamMsg((m) => ({ ...m, [slug]: "" }));
    setInviteLink((l) => ({ ...l, [slug]: "" }));
    try {
      const r = await fetch(`/api/members?client=${encodeURIComponent(slug)}`, {
        method: "POST", headers: await authedHeaders(),
        body: JSON.stringify({ email: f.email.trim(), role: f.role }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setTeamMsg((m) => ({ ...m, [slug]: j.error || `Error ${r.status}` })); return; }
      if (j.inviteLink) setInviteLink((l) => ({ ...l, [slug]: j.inviteLink }));
      setInviteForm((ff) => ({ ...ff, [slug]: { email: "", role: f.role } }));
      await loadTeam(slug);
    } catch (e) { setTeamMsg((m) => ({ ...m, [slug]: e.message })); }
  };

  const removeMember = async (slug, userId) => {
    try {
      const r = await fetch(`/api/members?client=${encodeURIComponent(slug)}`, {
        method: "DELETE", headers: await authedHeaders(), body: JSON.stringify({ userId }),
      });
      if (r.ok) await loadTeam(slug);
      else { const j = await r.json().catch(() => ({})); setTeamMsg((m) => ({ ...m, [slug]: j.error || `Error ${r.status}` })); }
    } catch (e) { setTeamMsg((m) => ({ ...m, [slug]: e.message })); }
  };

  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  return (
    <div className="pa"><Styles />
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">Platform administration</div>
        <h1 className="serif">Client Organizations</h1>
        <div className="sub">Create and manage the associations & chapters that run events on your platform.</div>
      </div></div>

      <div className="wrap panel">
        <div className="settings" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Not connected" : user ? "Signed in — connecting" : "Enter platform passcode"}</span>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Signed in as {user.email}</span>
              <button className="btn ghost sm" onClick={() => { signOut(); setDb("idle"); setOrgs([]); }}>Sign out</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input className="pwd" type="password" placeholder="Platform master passcode" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
              <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} />{db === "loading" ? "…" : "Connect"}</button>
              <button className="btn ghost sm" onClick={() => setShowLogin((v) => !v)}>Sign in with email instead</button>
            </div>
          )}
        </div>
        {showLogin && !user && (
          <div className="addcard" style={{ marginTop: -6 }}>
            <LoginPanel onSignedIn={() => setShowLogin(false)} note="Platform admins (owners of the house org) can sign in with a magic link instead of the master passcode." />
          </div>
        )}
        {msg && <div className="hint" style={{ color: "var(--warn)", marginTop: -10, marginBottom: 16 }}><AlertTriangle size={14} />{msg}</div>}

        {db === "live" && (
          <>
            <div className="addcard">
              <div className="addhdr"><Plus size={17} /> Add a client organization</div>
              <div className="fgrid">
                <div className="f span4"><label>URL slug</label><input value={form.slug} placeholder="dallas-safari-club" onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))} /></div>
                <div className="f span5"><label>Organization name</label><input value={form.name} placeholder="Dallas Safari Club — Austin Chapter" onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="f span3"><label>Contact email</label><input value={form.contactEmail} placeholder="admin@chapter.org" onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} /></div>
                <div className="f span12" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  {formErr ? <span style={{ fontSize: 12.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{formErr}</span> : <span />}
                  <button className="btn" onClick={createOrg}><Plus size={16} /> Create organization</button>
                </div>
              </div>
            </div>

            {orgs.length === 0 ? (
              <div className="empty">No organizations yet. Create your first client above.</div>
            ) : orgs.map((o) => (
              <div className="org" key={o.slug}>
                <div className="org-top">
                  <div>
                    <div className="org-name"><Building2 size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 7, color: "var(--pine)" }} />{o.name}</div>
                    <div className="org-slug">?client={o.slug} · {o.event_count} event{o.event_count === 1 ? "" : "s"}{o.plan ? ` · ${o.plan}` : ""}</div>
                  </div>
                  <div className="chips">
                    <span className={`chip ${o.has_passcode ? "ok" : "no"}`}><KeyRound size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{o.has_passcode ? "passcode set" : "no passcode"}</span>
                    <span className={`chip ${o.stripe_connected ? "ok" : "no"}`}><Link2 size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{o.stripe_connected ? "payouts on" : "no payouts"}</span>
                    <span className={`chip ${o.billing_active ? "ok" : "no"}`}><CreditCard size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{o.billing_active ? "billing on" : "no billing"}</span>
                  </div>
                </div>
                <div className="org-row">
                  <input className="pwd" type="password" placeholder={o.has_passcode ? "New owner passcode…" : "Set owner passcode…"} value={pcEdit[o.slug] || ""} onChange={(e) => setPcEdit((p) => ({ ...p, [o.slug]: e.target.value }))} />
                  <button className="btn sm" disabled={!(pcEdit[o.slug] || "").trim()} onClick={() => savePasscode(o.slug)}><Check size={13} /> Save passcode</button>
                  <span className="hint" style={{ marginLeft: 4 }}>Give this to the org's admin — it unlocks all of their events.</span>
                </div>
                <div className="org-row">
                  <button className="btn ghost sm" disabled={busySlug === o.slug + "connect"} onClick={() => stripeAction(o.slug, "connect")}>
                    <Link2 size={13} /> {o.stripe_connected ? (o.payouts_enabled ? "Payouts ready — manage" : "Finish payout setup") : "Set up payouts (Stripe)"}
                  </button>
                  <button className="btn ghost sm" disabled={busySlug === o.slug + "billing"} onClick={() => stripeAction(o.slug, "billing")}>
                    <CreditCard size={13} /> {o.billing_active ? "Manage subscription" : "Start subscription"}
                  </button>
                  <span className="hint" style={{ marginLeft: 4 }}>Payouts = they collect ticket money (minus your fee). Subscription = your platform fee.</span>
                </div>
                <div className="org-row">
                  <button className="btn ghost sm" onClick={() => toggleTeam(o.slug)}><Users size={13} /> {teamOpen[o.slug] ? "Hide team" : "Manage team"}</button>
                  <span className="hint" style={{ marginLeft: 4 }}>Invite real logins (magic link) to run this org's events. Passcode still works too.</span>
                </div>
                {teamOpen[o.slug] && (
                  <div style={{ marginTop: 10, borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
                    {teamMsg[o.slug] && <div className="hint" style={{ color: "var(--warn)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{teamMsg[o.slug]}</div>}
                    {(team[o.slug]?.members?.length || 0) === 0 && (team[o.slug]?.invites?.length || 0) === 0 && (
                      <div className="hint" style={{ marginBottom: 10 }}>No team members yet — send the first invite below.</div>
                    )}
                    {team[o.slug]?.members?.map((m) => (
                      <div className="org-row" key={m.user_id} style={{ marginTop: 0, justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>{m.email} <span className="chip ok" style={{ marginLeft: 6 }}>{m.role}</span></span>
                        <button className="btn ghost sm" onClick={() => removeMember(o.slug, m.user_id)}><Trash2 size={12} /> Remove</button>
                      </div>
                    ))}
                    {team[o.slug]?.invites?.map((iv, i) => (
                      <div className="org-row" key={`iv-${i}`} style={{ marginTop: 0 }}>
                        <span style={{ fontSize: 13, color: "var(--inkSoft)" }}>{iv.email} <span className="chip no" style={{ marginLeft: 6 }}>{iv.role} · pending</span></span>
                      </div>
                    ))}
                    <div className="org-row">
                      <input className="pwd" type="email" placeholder="new.member@org.org" style={{ width: 200 }}
                        value={inviteForm[o.slug]?.email || ""}
                        onChange={(e) => setInviteForm((f) => ({ ...f, [o.slug]: { ...(f[o.slug] || { role: "staff" }), email: e.target.value } }))}
                        onKeyDown={(e) => e.key === "Enter" && sendInvite(o.slug)} />
                      <select className="pwd" style={{ width: "auto" }}
                        value={inviteForm[o.slug]?.role || "staff"}
                        onChange={(e) => setInviteForm((f) => ({ ...f, [o.slug]: { ...(f[o.slug] || { email: "" }), role: e.target.value } }))}>
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="staff">staff</option>
                        <option value="door">door</option>
                      </select>
                      <button className="btn sm" disabled={!(inviteForm[o.slug]?.email || "").trim()} onClick={() => sendInvite(o.slug)}><Plus size={13} /> Send invite</button>
                    </div>
                    {inviteLink[o.slug] && (
                      <div className="org-row" style={{ marginTop: 6 }}>
                        <input className="pwd" readOnly style={{ width: 320 }} value={inviteLink[o.slug]} onFocus={(e) => e.target.select()} />
                        <button className="btn ghost sm" onClick={() => { try { navigator.clipboard.writeText(inviteLink[o.slug]); } catch {} }}><Copy size={12} /> Copy link</button>
                        <span className="hint">Share this with the invitee — it signs them in and joins them.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="hint" style={{ marginTop: 18 }}>
              Stripe payouts (Connect) and subscription billing per organization arrive in the next release. Assign events to an org from Event Setup.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
