import React, { useState, useEffect } from "react";
import {
  Settings, Users, Heart, ScanLine, FileText, LayoutGrid, ExternalLink,
  ChevronDown, LogOut, Menu, X, Building2,
} from "lucide-react";
import { getEventConfig, eventLink, getAdminKey, setAdminKey } from "./eventConfig.js";

/* ============================================================================
   AdminShell — the ONE organizer navigation.
   ----------------------------------------------------------------------------
   Replaces the old top link bar AND the in-page Register/Door/Organizer/Ledger
   toggle with a single left sidebar, grouped by job-to-be-done, plus a header
   that shows which EVENT you're working on (with a switcher when you're signed
   in with the master passcode). Attendee-facing pages never render this — so
   guests never see admin controls.

   Modules map to the existing routes (query-param based, no router dep):
     Event Setup      /?app=setup
     Registrations    /?view=admin    (the roster inside the registration app)
     Sponsorships     /?app=sponsorships
     Door / Check-in  /?view=door
     Auction          /?app=settlement
   ========================================================================== */

const GROUPS = [
  { label: "Plan", items: [
    { key: "setup", label: "Event Setup", icon: Settings, href: "/?app=setup" },
  ]},
  { label: "Sell & register", items: [
    { key: "roster", label: "Registrations", icon: Users, href: "/?view=admin" },
    { key: "sponsorships", label: "Sponsorships", icon: Heart, href: "/?app=sponsorships" },
  ]},
  { label: "Run the event", items: [
    { key: "door", label: "Door / Check-in", icon: ScanLine, href: "/?view=door" },
  ]},
  { label: "Reconcile", items: [
    { key: "settlement", label: "Auction Settlement", icon: FileText, href: "/?app=settlement" },
  ]},
];

const Styles = () => (
  <style>{`
    .ash{display:flex;min-height:100vh;background:var(--bone);font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);}
    .ash-side{width:236px;flex-shrink:0;background:var(--pine2);color:#cfe0d7;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;}
    .ash-brand{padding:18px 18px 12px;border-bottom:1px solid rgba(255,255,255,.08);}
    .ash-eyebrow{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--goldSoft);font-weight:700;}
    .ash-switch{margin-top:8px;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 11px;cursor:pointer;color:#fff;font-family:inherit;font-weight:700;font-size:14px;text-align:left;}
    .ash-switch:hover{background:rgba(255,255,255,.1);}
    .ash-switch .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ash-menu{background:var(--paper);color:var(--ink);border:1.5px solid var(--line);border-radius:12px;margin:6px 14px 0;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18);}
    .ash-menu button{display:flex;align-items:center;justify-content:space-between;width:100%;border:none;background:transparent;font-family:inherit;font-size:13.5px;padding:10px 13px;cursor:pointer;color:var(--ink);text-align:left;gap:8px;}
    .ash-menu button:hover{background:var(--bone2);}
    .ash-menu .cur{color:var(--pine);font-weight:700;}
    .ash-nav{flex:1;padding:12px 10px;}
    .ash-grp{margin-bottom:14px;}
    .ash-grp-l{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#7f9a8e;font-weight:700;padding:6px 10px 4px;}
    .ash-link{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:9px;color:#bcd0c6;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer;border:none;background:transparent;width:100%;font-family:inherit;text-align:left;}
    .ash-link:hover{background:rgba(255,255,255,.07);color:#fff;}
    .ash-link.on{background:var(--gold);color:#1b1407;}
    .ash-foot{padding:12px 14px;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:4px;}
    .ash-foot a,.ash-foot button{display:flex;align-items:center;gap:9px;color:#9DB3A8;font-size:12.5px;font-weight:600;text-decoration:none;background:none;border:none;font-family:inherit;cursor:pointer;padding:6px 4px;text-align:left;}
    .ash-foot a:hover,.ash-foot button:hover{color:#fff;}
    .ash-main{flex:1;min-width:0;}
    .ash-topbar{display:none;}
    @media(max-width:900px){
      .ash{flex-direction:column;}
      .ash-side{position:fixed;z-index:80;left:0;top:0;bottom:0;height:100vh;transform:translateX(-100%);transition:transform .2s;box-shadow:0 0 40px rgba(0,0,0,.4);}
      .ash-side.open{transform:translateX(0);}
      .ash-topbar{display:flex;align-items:center;justify-content:space-between;background:var(--pine2);color:#fff;padding:12px 16px;position:sticky;top:0;z-index:70;}
      .ash-topbar .t{font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;}
      .ash-burger{background:none;border:none;color:#fff;cursor:pointer;padding:4px;}
      .ash-scrim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:75;}
    }
  `}</style>
);

export default function AdminShell({ active, children }) {
  const cfg = getEventConfig();
  const [events, setEvents] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Populate the event switcher only when signed in with the master passcode
  // (the list endpoint is master-gated); otherwise we just show the current
  // event's name with no switcher.
  useEffect(() => {
    const key = getAdminKey();
    if (!key) return;
    fetch("/api/event-config?list=1", { headers: { "x-organizer-key": key } })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setEvents(Array.isArray(j) ? j : []))
      .catch(() => {});
  }, []);

  const switchTo = (ev) => {
    const p = new URLSearchParams(window.location.search);
    if (ev.is_default) p.delete("event"); else p.set("event", ev.event_id);
    window.location.href = window.location.pathname + "?" + p.toString();
  };

  const Sidebar = (
    <aside className={`ash-side${navOpen ? " open" : ""}`}>
      <div className="ash-brand">
        <div className="ash-eyebrow">Organizer console</div>
        <button className="ash-switch" onClick={() => setMenuOpen((v) => !v)} disabled={events.length === 0}>
          <span className="nm">{cfg.eventName}</span>
          {events.length > 0 && <ChevronDown size={15} />}
        </button>
      </div>
      {menuOpen && events.length > 0 && (
        <div className="ash-menu">
          {events.map((ev) => (
            <button key={ev.event_id} className={ev.event_id === cfg.eventId ? "cur" : ""} onClick={() => switchTo(ev)}>
              <span>{ev.event_name || ev.event_id}{ev.is_default ? " · default" : ""}</span>
            </button>
          ))}
        </div>
      )}
      <nav className="ash-nav">
        {GROUPS.map((g) => (
          <div className="ash-grp" key={g.label}>
            <div className="ash-grp-l">{g.label}</div>
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <a key={it.key} href={eventLink(it.href)} className={`ash-link${active === it.key ? " on" : ""}`}>
                  <Icon size={16} /> {it.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="ash-foot">
        <a href="/?app=platform"><Building2 size={14} /> Organizations</a>
        <a href={eventLink("/")} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View public page</a>
        <button onClick={() => { setAdminKey(""); window.location.href = eventLink("/"); }}><LogOut size={14} /> Sign out</button>
      </div>
    </aside>
  );

  return (
    <div className="ash"><Styles />
      <div className="ash-topbar">
        <span className="t"><LayoutGrid size={16} /> {cfg.eventName}</span>
        <button className="ash-burger" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">
          {navOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {navOpen && <div className="ash-scrim" onClick={() => setNavOpen(false)} />}
      {Sidebar}
      <div className="ash-main">{children}</div>
    </div>
  );
}
