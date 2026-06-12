import React from "react";

const links = [
  { label: "Registration", href: "/", app: null },
  { label: "Auction Settlement", href: "/?app=settlement", app: "settlement" },
  { label: "Sponsorships", href: "/?app=sponsorships", app: "sponsorships" },
];

const current = new URLSearchParams(window.location.search).get("app");

export default function OrganizerNav() {
  return (
    <nav style={{
      background: "#0C2A20", borderBottom: "1px solid rgba(255,255,255,.1)",
      display: "flex", alignItems: "center", gap: 4, padding: "0 22px",
      fontFamily: "'Hanken Grotesk',ui-sans-serif,system-ui", flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: "#B9842B", marginRight: 10, padding: "12px 0" }}>EWA 2026</span>
      {links.map(({ label, href, app }) => {
        const active = app === current;
        return (
          <a key={href} href={href} style={{
            color: active ? "#fff" : "#9DB3A8",
            fontWeight: active ? 700 : 500,
            fontSize: 13,
            padding: "12px 14px",
            textDecoration: "none",
            borderBottom: active ? "2px solid #B9842B" : "2px solid transparent",
            display: "inline-block",
            transition: "color .15s",
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#9DB3A8"; }}
          >{label}</a>
        );
      })}
    </nav>
  );
}
