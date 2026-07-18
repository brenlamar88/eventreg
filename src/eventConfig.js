// src/eventConfig.js
// ---------------------------------------------------------------------------
// White-label event configuration. Every page reads its branding, copy, and
// pricing from here instead of hardcoding it; the values come from
// /api/event-config (the event_settings row), edited on the Event Setup
// screen (/?app=setup). The DEFAULTS are the original Boil on the Bend look —
// a NULL/absent field means "keep the default", so a fresh deploy looks
// exactly like before until an organizer customizes it.
//
// Boot order matters: main.jsx awaits loadEventConfig() BEFORE importing the
// app components, so module-level `getEventConfig()` reads resolved config.
// The last-known config is cached in localStorage — instant boots, and the
// door iPads keep their branding offline.
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  eventId: "boil85",
  eventName: "Boil on the Bend",
  orgName: "Exotic Wildlife Association of Louisiana",
  orgShort: "EWA-LA",
  tagline: "An evening on the bayou — crawfish, cold drinks, and good company in support of EWA-LA.",
  dateLabel: "Saturday · Date TBD",
  venue: "On the Bend",
  city: "Louisiana",
  ticketName: "Boil on the Bend — Admission",
  ticketPrice: 85,
  donationPresets: [25, 50, 100],
  logoUrl: null,
  colors: {
    primary: "#123C2E",      // pine
    primaryDark: "#0C2A20",  // pine2
    accent: "#B9842B",       // gold
    background: "#F4EFE6",   // bone
  },
};

// Multi-event: /?event=<slug> selects the event on every page; no param =
// the server's default event. The resolved slug rides along on API calls
// (withEvent) and page links (eventLink).
export const EVENT_PARAM = (() => {
  try { return (new URLSearchParams(window.location.search).get("event") || "").trim().toLowerCase(); }
  catch { return ""; }
})();

const LS_KEY = "eventreg-config-v1" + (EVENT_PARAM ? ":" + EVENT_PARAM : "");
let current = DEFAULTS;

export function getEventConfig() {
  return current;
}

// Append the resolved event to an API url (safe everywhere — routes that
// don't scope by event just ignore the param).
export function withEvent(url) {
  const id = current.eventId || EVENT_PARAM || DEFAULTS.eventId;
  return url + (url.includes("?") ? "&" : "?") + "event=" + encodeURIComponent(id);
}

// Propagate the event through page links — only when one was explicitly in
// the URL, so default-event links stay clean.
export function eventLink(href) {
  if (!EVENT_PARAM) return href;
  return href + (href.includes("?") ? "&" : "?") + "event=" + encodeURIComponent(EVENT_PARAM);
}

// Shared organizer session: once you sign in on any admin screen the passcode
// is remembered for the tab, so you don't retype it moving between modules.
// sessionStorage (not local) so it clears when the tab closes.
const ADMIN_KEY = "eventreg-admin-key";
export function getAdminKey() {
  try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch { return ""; }
}
export function setAdminKey(key) {
  try { key ? sessionStorage.setItem(ADMIN_KEY, key) : sessionStorage.removeItem(ADMIN_KEY); } catch { /* private mode */ }
}

const pick = (v, d) => (v === null || v === undefined || v === "" ? d : v);

function fromRow(row) {
  if (!row) return DEFAULTS;
  return {
    ...DEFAULTS,
    eventId: pick(row.event_id, EVENT_PARAM || DEFAULTS.eventId),
    eventName: pick(row.event_name, DEFAULTS.eventName),
    orgName: pick(row.org_name, DEFAULTS.orgName),
    orgShort: pick(row.org_short, DEFAULTS.orgShort),
    tagline: pick(row.tagline, DEFAULTS.tagline),
    dateLabel: pick(row.date_label, DEFAULTS.dateLabel),
    venue: pick(row.venue, DEFAULTS.venue),
    city: pick(row.city, DEFAULTS.city),
    ticketName: pick(row.ticket_name, DEFAULTS.ticketName),
    ticketPrice: row.ticket_price != null ? Number(row.ticket_price) : DEFAULTS.ticketPrice,
    donationPresets:
      Array.isArray(row.donation_presets) && row.donation_presets.length
        ? row.donation_presets.map(Number).filter((n) => isFinite(n) && n > 0)
        : DEFAULTS.donationPresets,
    logoUrl: row.logo_url || null,
    colors: {
      primary: pick(row.color_primary, DEFAULTS.colors.primary),
      primaryDark: pick(row.color_primary_dark, DEFAULTS.colors.primaryDark),
      accent: pick(row.color_accent, DEFAULTS.colors.accent),
      background: pick(row.color_background, DEFAULTS.colors.background),
    },
  };
}

// Mix two #rrggbb colors; amt=0 → a, amt=1 → b. Used to derive the secondary
// shades (borders, soft accents, paper) from the four configured colors.
function mix(a, b, amt) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * amt).toString(16).padStart(2, "0")).join("");
}

// Stamp the theme as inline CSS variables on <html> — inline style beats the
// :root rules inside each app's <style> block, so all three apps (and the
// stations and ticket page) recolor from one place.
export function applyTheme(cfg = current) {
  try {
    const c = cfg.colors;
    const root = document.documentElement.style;
    root.setProperty("--pine", c.primary);
    root.setProperty("--pine2", c.primaryDark);
    root.setProperty("--pineLine", mix(c.primary, "#ffffff", 0.22));
    root.setProperty("--gold", c.accent);
    root.setProperty("--goldSoft", mix(c.accent, "#ffffff", 0.45));
    root.setProperty("--bone", c.background);
    root.setProperty("--bone2", mix(c.background, "#000000", 0.06));
    root.setProperty("--paper", mix(c.background, "#ffffff", 0.55));
  } catch { /* non-browser context */ }
}

export async function loadEventConfig() {
  // 1. Cached config boots instantly (and carries the door iPads offline).
  let hadCache = false;
  try {
    const cached = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (cached && typeof cached === "object") {
      current = { ...DEFAULTS, ...cached, colors: { ...DEFAULTS.colors, ...(cached.colors || {}) } };
      hadCache = true;
    }
  } catch { /* corrupt cache — defaults */ }

  // 2. Refresh from the server; without a cache, wait briefly so the first
  //    paint is branded — but never block boot on a dead network.
  const refresh = (async () => {
    try {
      const r = await fetch("/api/event-config" + (EVENT_PARAM ? `?event=${encodeURIComponent(EVENT_PARAM)}` : ""));
      if (!r.ok) return;
      current = fromRow(await r.json());
      try { localStorage.setItem(LS_KEY, JSON.stringify(current)); } catch {}
      applyTheme(current);
    } catch { /* offline — cache/defaults stand */ }
  })();
  if (!hadCache) await Promise.race([refresh, new Promise((res) => setTimeout(res, 2500))]);

  applyTheme(current);
  return current;
}
