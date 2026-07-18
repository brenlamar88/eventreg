import React, { useState, useEffect } from "react";
import {
  Database, AlertTriangle, Check, Palette, Type, DollarSign, Image, Save,
  RefreshCw, Eye, Info,
} from "lucide-react";
import OrganizerNav from "./OrganizerNav.jsx";
import { DEFAULTS, applyTheme } from "./eventConfig.js";

const IS_DEMO = new URLSearchParams(window.location.search).get("demo") === "true";
const LS_KEY = "eventreg-config-v1";

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--bone2:#EBE3D4;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .spo{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .serif{font-family:'Fraunces',Georgia,serif;}
    .wrap{max-width:1200px;margin:0 auto;padding:0 22px;}
    .head{background:linear-gradient(160deg,var(--pine),var(--pine2));color:#EAF1EC;}
    .head-in{padding:30px 0 0;}
    .eyebrow{font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .head h1{font-family:'Fraunces',serif;font-size:34px;font-weight:600;margin:8px 0 0;letter-spacing:-.01em;}
    .head .sub{color:#A9C0B5;font-size:14px;margin-top:4px;padding-bottom:28px;}
    .panel{padding:24px 0 90px;}
    .settings{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
    .settings label{font-size:12.5px;font-weight:700;color:#4a463d;display:flex;align-items:center;gap:7px;}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
    .pwd{font-family:inherit;font-size:13px;padding:8px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;width:150px;}
    .btn{font-family:inherit;font-weight:700;font-size:13.5px;border-radius:10px;cursor:pointer;padding:9px 15px;display:inline-flex;align-items:center;gap:8px;border:1.5px solid transparent;background:var(--pine);color:#fff;}
    .btn:hover{background:var(--pine2);}
    .btn:disabled{opacity:.4;cursor:not-allowed;}
    .btn.ghost{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn.ghost:hover{border-color:var(--pine);}
    .btn.sm{font-size:12px;padding:6px 11px;}
    .addcard{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:20px;margin-bottom:22px;}
    .addhdr{font-family:'Fraunces',serif;font-size:17px;font-weight:600;display:flex;align-items:center;gap:9px;margin-bottom:14px;}
    .fgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;}
    .f{display:flex;flex-direction:column;gap:5px;}
    .f label{font-size:11.5px;font-weight:600;color:#4a463d;}
    .f input,.f select,.f textarea{font-family:inherit;font-size:13.5px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);outline:none;width:100%;}
    .f input:focus,.f select:focus,.f textarea:focus{border-color:var(--pine);}
    .f textarea{resize:vertical;min-height:60px;}
    .f input[type=color]{padding:3px;height:42px;cursor:pointer;}
    .f input:disabled,.f textarea:disabled{background:var(--bone2);cursor:not-allowed;opacity:.7;}
    .span2{grid-column:span 2;}.span3{grid-column:span 3;}.span4{grid-column:span 4;}.span6{grid-column:span 6;}.span12{grid-column:span 12;}
    @media(max-width:760px){.span2,.span3,.span4,.span6{grid-column:span 6;}}
    .hint{font-size:12px;color:var(--inkSoft);margin-top:10px;display:flex;align-items:center;gap:7px;}
    .hintbox{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:14px 18px;font-size:13px;color:var(--inkSoft);display:flex;align-items:flex-start;gap:10px;line-height:1.5;}
    .savedmsg{background:#e4f0e9;color:var(--ok);border:1.5px solid #bcd9c9;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:8px;}
    .errmsg{background:#fde8e0;color:var(--warn);border:1.5px solid #eccdb9;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:8px;}
  `}</style>
);

// The form's field keys — text fields default to "" (empty = built-in default).
const blankForm = {
  eventName: "", orgName: "", orgShort: "", tagline: "", dateLabel: "",
  venue: "", city: "", ticketName: "", ticketPrice: "", donationPresetsText: "",
};

const rowToForm = (row) => ({
  eventName: row.event_name || "",
  orgName: row.org_name || "",
  orgShort: row.org_short || "",
  tagline: row.tagline || "",
  dateLabel: row.date_label || "",
  venue: row.venue || "",
  city: row.city || "",
  ticketName: row.ticket_name || "",
  ticketPrice: row.ticket_price != null ? String(row.ticket_price) : "",
  donationPresetsText: Array.isArray(row.donation_presets) ? row.donation_presets.join(", ") : "",
});

const rowToColors = (row) => ({
  primary: row.color_primary || DEFAULTS.colors.primary,
  primaryDark: row.color_primary_dark || DEFAULTS.colors.primaryDark,
  accent: row.color_accent || DEFAULTS.colors.accent,
  background: row.color_background || DEFAULTS.colors.background,
});

const parsePresets = (text) =>
  String(text || "").split(",").map((s) => Number(s.trim())).filter((n) => isFinite(n) && n > 0);

export default function EventSetup() {
  const [passcode, setPasscode] = useState("");
  const [db, setDb] = useState("idle");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(blankForm);
  const [colors, setColors] = useState({ ...DEFAULTS.colors });
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoMsg, setLogoMsg] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveErr, setSaveErr] = useState("");

  const connected = db === "live";
  const canEdit = connected || IS_DEMO;
  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": passcode });
  const setF = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setSaveState("idle"); };
  const setC = (k, v) => { setColors((p) => ({ ...p, [k]: v })); setSaveState("idle"); };
  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  useEffect(() => {
    if (!IS_DEMO) return;
    setForm({
      eventName: DEFAULTS.eventName, orgName: DEFAULTS.orgName, orgShort: DEFAULTS.orgShort,
      tagline: DEFAULTS.tagline, dateLabel: DEFAULTS.dateLabel, venue: DEFAULTS.venue,
      city: DEFAULTS.city, ticketName: DEFAULTS.ticketName, ticketPrice: String(DEFAULTS.ticketPrice),
      donationPresetsText: DEFAULTS.donationPresets.join(", "),
    });
    setColors({ ...DEFAULTS.colors });
    setDb("live");
  }, []);

  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      // Verify the passcode against an organizer-gated endpoint.
      const auth = await fetch("/api/settings", { headers: hdr() });
      if (!auth.ok) throw new Error(auth.status === 401 ? "Wrong passcode." : `Error ${auth.status}`);
      // Load the current (raw) settings row — public endpoint.
      const r = await fetch("/api/event-config");
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const row = await r.json();
      setForm(rowToForm(row));
      setColors(rowToColors(row));
      setLogoUrl(row.logo_url || null);
      setDb("live");
      setMsg("Connected — current configuration loaded.");
    } catch (e) {
      setDb("offline");
      setMsg(`Could not connect (${e.message})`);
    }
  };

  const save = async () => {
    if (IS_DEMO || !connected) return;
    setSaveState("saving"); setSaveErr("");
    const body = {
      eventName: form.eventName.trim(),
      orgName: form.orgName.trim(),
      orgShort: form.orgShort.trim(),
      tagline: form.tagline.trim(),
      dateLabel: form.dateLabel.trim(),
      venue: form.venue.trim(),
      city: form.city.trim(),
      ticketName: form.ticketName.trim(),
      ticketPrice: form.ticketPrice.trim() === "" ? "" : Number(form.ticketPrice),
      donationPresets: parsePresets(form.donationPresetsText),
      colorPrimary: colors.primary,
      colorPrimaryDark: colors.primaryDark,
      colorAccent: colors.accent,
      colorBackground: colors.background,
    };
    try {
      const r = await fetch("/api/event-config", { method: "PUT", headers: hdr(), body: JSON.stringify(body) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `Error ${r.status}`);
      }
      // Drop the cached config so the next boot refetches the fresh row.
      try { localStorage.removeItem(LS_KEY); } catch {}
      applyTheme({ colors: { ...colors } });
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveErr(e.message);
    }
  };

  const uploadLogo = (file) => {
    if (!file || IS_DEMO || !connected) return;
    setLogoMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataBase64 = String(reader.result).split(",")[1] || "";
      try {
        const r = await fetch("/api/event-logo", { method: "POST", headers: hdr(), body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setLogoMsg(j.error || `Upload failed (${r.status})`); return; }
        setLogoUrl(j.logoUrl);
        setLogoMsg("Logo uploaded.");
      } catch {
        setLogoMsg("Upload failed — network error.");
      }
    };
    reader.readAsDataURL(file);
  };

  const previewTheme = () => applyTheme({ colors: { ...colors } });
  const resetColors = () => { setColors({ ...DEFAULTS.colors }); setSaveState("idle"); };

  const colorField = (key, label) => (
    <div className="f span3">
      <label>{label}</label>
      <input type="color" value={colors[key]} disabled={!canEdit} onChange={(e) => setC(key, e.target.value)} />
    </div>
  );

  return (
    <div className="spo"><Styles /><OrganizerNav />
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">Organizer Tools</div>
        <h1 className="serif">Event Setup</h1>
        <div className="sub">White-label branding, copy, and pricing — changes apply to every page</div>
      </div></div>

      <div className="wrap panel">
        {IS_DEMO && (
          <div style={{background:"#B9842B",color:"#fff",borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10,fontWeight:600,fontSize:14}}>
            <AlertTriangle size={16}/> DEMO MODE — Sample data only. No real data is shown or saved. Color preview works; saving is disabled.
          </div>
        )}

        {/* ---- connection bar ---- */}
        {!IS_DEMO && <div className="settings">
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Offline" : "Not connected"}</span>
            <input className="pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
            <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} />{db === "loading" ? "Connecting…" : "Connect"}</button>
          </div>
        </div>}
        {!IS_DEMO && msg && <div className="hint" style={{ marginTop: -10, marginBottom: 16, color: db === "offline" ? "var(--warn)" : "var(--ok)" }}>{db === "offline" && <AlertTriangle size={14} />}{msg}</div>}

        {/* ---- event identity ---- */}
        <div className="addcard">
          <div className="addhdr"><Type size={17} /> Event identity</div>
          <div className="fgrid">
            <div className="f span4"><label>Event name</label><input value={form.eventName} disabled={!canEdit} onChange={(e) => setF("eventName", e.target.value)} placeholder={DEFAULTS.eventName} /></div>
            <div className="f span4"><label>Organization name</label><input value={form.orgName} disabled={!canEdit} onChange={(e) => setF("orgName", e.target.value)} placeholder={DEFAULTS.orgName} /></div>
            <div className="f span4"><label>Short name (used in copy, e.g. 'Donation to EWA-LA')</label><input value={form.orgShort} disabled={!canEdit} onChange={(e) => setF("orgShort", e.target.value)} placeholder={DEFAULTS.orgShort} /></div>
            <div className="f span12"><label>Tagline</label><textarea value={form.tagline} disabled={!canEdit} onChange={(e) => setF("tagline", e.target.value)} placeholder={DEFAULTS.tagline} /></div>
            <div className="f span4"><label>Date label</label><input value={form.dateLabel} disabled={!canEdit} onChange={(e) => setF("dateLabel", e.target.value)} placeholder={DEFAULTS.dateLabel} /></div>
            <div className="f span4"><label>Venue</label><input value={form.venue} disabled={!canEdit} onChange={(e) => setF("venue", e.target.value)} placeholder={DEFAULTS.venue} /></div>
            <div className="f span4"><label>City</label><input value={form.city} disabled={!canEdit} onChange={(e) => setF("city", e.target.value)} placeholder={DEFAULTS.city} /></div>
          </div>
        </div>

        {/* ---- tickets & donations ---- */}
        <div className="addcard">
          <div className="addhdr"><DollarSign size={17} /> Tickets &amp; donations</div>
          <div className="fgrid">
            <div className="f span6"><label>Ticket name</label><input value={form.ticketName} disabled={!canEdit} onChange={(e) => setF("ticketName", e.target.value)} placeholder={DEFAULTS.ticketName} /></div>
            <div className="f span3"><label>Ticket price ($)</label><input inputMode="decimal" value={form.ticketPrice} disabled={!canEdit} onChange={(e) => setF("ticketPrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(DEFAULTS.ticketPrice)} /></div>
            <div className="f span3"><label>Suggested donation amounts</label><input value={form.donationPresetsText} disabled={!canEdit} onChange={(e) => setF("donationPresetsText", e.target.value)} placeholder="25, 50, 100" /></div>
          </div>
        </div>

        {/* ---- brand colors ---- */}
        <div className="addcard">
          <div className="addhdr"><Palette size={17} /> Brand colors</div>
          <div className="fgrid">
            {colorField("primary", "Primary")}
            {colorField("primaryDark", "Primary (dark)")}
            {colorField("accent", "Accent")}
            {colorField("background", "Background")}
            <div className="f span6">
              <label>Live preview</label>
              <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, overflow: "hidden", background: colors.background }}>
                <div style={{ background: `linear-gradient(160deg,${colors.primary},${colors.primaryDark})`, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10.5, letterSpacing: ".2em", textTransform: "uppercase", color: colors.accent, fontWeight: 700 }}>{form.orgName || DEFAULTS.orgName}</div>
                  <div className="serif" style={{ color: "#fff", fontSize: 17, fontWeight: 600, marginTop: 3 }}>{form.eventName || DEFAULTS.eventName}</div>
                </div>
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, borderRadius: 9, border: "none", cursor: "default", padding: "8px 14px", background: colors.primary, color: "#fff" }}>Register</button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>{form.dateLabel || DEFAULTS.dateLabel}</span>
                </div>
              </div>
            </div>
            <div className="f span6" style={{ justifyContent: "flex-end" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={previewTheme} disabled={!canEdit}><Eye size={13} /> Preview on this page</button>
                <button className="btn ghost sm" onClick={resetColors} disabled={!canEdit}><RefreshCw size={13} /> Reset colors to default</button>
              </div>
              <div className="hint" style={{ marginTop: 8 }}><Info size={13} /> Preview recolors this page only — nothing is saved until you hit Save.</div>
            </div>
          </div>
        </div>

        {/* ---- logo ---- */}
        <div className="addcard">
          <div className="addhdr"><Image size={17} /> Logo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Event logo" style={{ maxHeight: 56, maxWidth: 180, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", padding: 4 }} />
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--inkSoft)" }}>No logo uploaded yet.</span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={IS_DEMO || !connected} style={{ fontSize: 12.5 }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
            {IS_DEMO && <span style={{ fontSize: 11.5, color: "var(--inkSoft)" }}>Upload disabled in demo.</span>}
            {logoMsg && <span className="hint" style={{ marginTop: 0, color: logoMsg === "Logo uploaded." ? "var(--ok)" : "var(--warn)" }}>{logoMsg === "Logo uploaded." ? <Check size={13} /> : <AlertTriangle size={13} />}{logoMsg}</span>}
          </div>
        </div>

        {/* ---- save ---- */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <button className="btn" onClick={save} disabled={IS_DEMO || !connected || saveState === "saving"}>
            <Save size={15} /> {saveState === "saving" ? "Saving…" : "Save configuration"}
          </button>
          {saveState === "saved" && <span className="savedmsg"><Check size={14} /> Saved — guests see it on their next page load</span>}
          {saveState === "error" && <span className="errmsg"><AlertTriangle size={14} /> Could not save ({saveErr})</span>}
          {IS_DEMO && <span style={{ fontSize: 12.5, color: "var(--inkSoft)", fontWeight: 600 }}>Saving is disabled in demo mode.</span>}
        </div>

        <div className="hintbox">
          <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Empty fields fall back to the built-in defaults. Colors, names, and pricing apply everywhere: registration, door, stations, ticket pages, sponsorships, and settlement.</span>
        </div>
      </div>
    </div>
  );
}
