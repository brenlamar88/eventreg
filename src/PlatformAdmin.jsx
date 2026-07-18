import React, { useState, useEffect } from "react";
import { Building2, Plus, Database, AlertTriangle, Check, KeyRound, CreditCard, Link2 } from "lucide-react";
import { getAdminKey, setAdminKey } from "./eventConfig.js";

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

  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": key });

  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      const r = await fetch("/api/organizations", { headers: { "x-organizer-key": key } });
      if (!r.ok) throw new Error(r.status === 401 ? "Wrong platform passcode." : `Error ${r.status}`);
      setOrgs(await r.json());
      setAdminKey(key);
      setDb("live");
    } catch (e) { setDb("offline"); setMsg(e.message); }
  };

  useEffect(() => { if (getAdminKey()) connect(); /* eslint-disable-next-line */ }, []);

  const refresh = async () => {
    try { const r = await fetch("/api/organizations", { headers: { "x-organizer-key": key } }); if (r.ok) setOrgs(await r.json()); } catch {}
  };

  const createOrg = async () => {
    setFormErr("");
    const slug = form.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) { setFormErr("Slug: lowercase letters, numbers, dashes; start alphanumeric; ≤41 chars."); return; }
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    try {
      const r = await fetch("/api/organizations", { method: "POST", headers: hdr(), body: JSON.stringify({ slug, name: form.name.trim(), contactEmail: form.contactEmail.trim() || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setForm({ slug: "", name: "", contactEmail: "" });
      await refresh();
    } catch (e) { setFormErr(e.message); }
  };

  const savePasscode = async (slug) => {
    const pc = (pcEdit[slug] || "").trim();
    try {
      const r = await fetch(`/api/organizations?slug=${encodeURIComponent(slug)}`, { method: "PUT", headers: hdr(), body: JSON.stringify({ ownerPasscode: pc }) });
      if (r.ok) { setPcEdit((p) => ({ ...p, [slug]: "" })); await refresh(); }
    } catch {}
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
        <div className="settings">
          <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Not connected" : "Enter platform passcode"}</span>
          <input className="pwd" type="password" placeholder="Platform master passcode" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
          <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} />{db === "loading" ? "…" : "Connect"}</button>
        </div>
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
