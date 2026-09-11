// src/badgePrint.js
// -----------------------------------------------------------------------------
// Name-badge printing for the door. AirPrint-friendly so an iPad can print to
// any AirPrint label printer (e.g. Brother QL-820NWB) straight from Safari's
// share/print sheet — no driver, no LAN bridge. We render the badge into a
// hidden, print-only DOM node, set the page size, and call window.print().
// Designed monochrome so it also reads correctly on B&W thermal printers.
// -----------------------------------------------------------------------------
import { getEventConfig } from "./eventConfig.js";

// Common badge / label media. Values feed the CSS @page size.
export const BADGE_SIZES = {
  "4x6":      { w: "4in",   h: "6in",    label: 'Thermal label — 4 × 6"' },
  "2x3":      { w: "2in",   h: "3in",    label: 'Thermal label — 2 × 3" (PL50E)' },
  "4x3":      { w: "4in",   h: "3in",    label: 'Name badge — 4 × 3"' },
  "3.5x2.25": { w: "3.5in", h: "2.25in", label: 'Badge — 3.5 × 2.25"' },
  "brother62":{ w: "2.4in", h: "3.9in",  label: "Brother DK 62 mm" },
  "4x2":      { w: "4in",   h: "2in",    label: 'Label — 4 × 2"' },
};

const SIZE_KEY = "badge-size", AUTO_KEY = "badge-autoprint", AUTO_SIGNUP_KEY = "badge-autoprint-signup";
export const getBadgeSize = () => { try { return localStorage.getItem(SIZE_KEY) || "4x3"; } catch { return "4x3"; } };
export const setBadgeSize = (v) => { try { localStorage.setItem(SIZE_KEY, v); } catch { /* private mode */ } };
export const getAutoPrint = () => { try { return localStorage.getItem(AUTO_KEY) === "1"; } catch { return false; } };
export const setAutoPrint = (on) => { try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* private mode */ } };
// Separate toggle for the sign-up / pre-reg flow (organizer admin view)
export const getAutoSignupPrint = () => { try { return localStorage.getItem(AUTO_SIGNUP_KEY) === "1"; } catch { return false; } };
export const setAutoSignupPrint = (on) => { try { localStorage.setItem(AUTO_SIGNUP_KEY, on ? "1" : "0"); } catch { /* private mode */ } };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ensureNodes() {
  let style = document.getElementById("badge-print-style");
  if (!style) { style = document.createElement("style"); style.id = "badge-print-style"; document.head.appendChild(style); }
  let root = document.getElementById("badge-print-root");
  if (!root) { root = document.createElement("div"); root.id = "badge-print-root"; document.body.appendChild(root); }
  return { style, root };
}

// Longer names get a smaller headline so they don't overflow a small label.
function nameSize(name, sizeKey) {
  const n = (name || "").length;
  const base = sizeKey === "brother62" || sizeKey === "4x2" ? 24 : 30;
  if (n > 22) return base - 8;
  if (n > 16) return base - 4;
  return base;
}

// Shared badge card — one attendee. Kept identical between the single-label
// print and the multi-up letter sheet so a badge looks the same either way.
const CARD_CSS =
  `.bp-card {
    box-sizing: border-box; width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 0.16in; color: #000;
    font-family: "Figtree", system-ui, sans-serif;
  }
  .bp-event { font-size: 9.5pt; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; margin-bottom: 0.07in; }
  .bp-name { font-weight: 700; line-height: 1.02; letter-spacing: -0.01em; }
  .bp-org { font-size: 12pt; margin-top: 0.07in; }
  .bp-bidder { font-size: 10.5pt; margin-top: 0.12in; letter-spacing: 0.08em; }
  .bp-bidder b { font-size: 15pt; }
  .bp-logo { max-height: 0.85in; max-width: 92%; width: auto; object-fit: contain; margin-bottom: 0.09in; }`;

function cardHtml(person, cfg, npt) {
  const name = esc(person.name || "Guest");
  const org = esc(person.ranch || person.sponsorName || "");
  const bidder = esc(person.bidderNumber || "");
  const event = esc(cfg.eventName || "");
  // Prefer the event logo at the top; fall back to the event name in text.
  const header = cfg.logoUrl
    ? `<img class="bp-logo" src="${esc(cfg.logoUrl)}" alt="" />`
    : event ? `<div class="bp-event">${event}</div>` : "";
  return `<div class="bp-card">
      ${header}
      <div class="bp-name" style="font-size:${npt}pt">${name}</div>
      ${org ? `<div class="bp-org">${org}</div>` : ""}
      ${bidder ? `<div class="bp-bidder">BIDDER <b>#${bidder}</b></div>` : ""}
    </div>`;
}

// Wait for the logo image to load before opening the print dialog, so it's
// actually rendered in the printout (with a short fallback timeout).
function whenReady(cfg, cb) {
  if (!cfg.logoUrl) return cb();
  let done = false;
  const finish = () => { if (!done) { done = true; cb(); } };
  const img = new Image();
  img.onload = finish;
  img.onerror = finish;
  img.src = cfg.logoUrl;
  if (img.complete) finish();
  setTimeout(finish, 2500);
}

// Shrink a headline for a smaller cell so long names don't overflow.
const shrinkFor = (name, base) => {
  const n = (name || "").length;
  if (n > 24) return base - 6;
  if (n > 17) return base - 3;
  return base;
};

export function printBadge(person, sizeKey = getBadgeSize()) {
  const cfg = getEventConfig();
  const size = BADGE_SIZES[sizeKey] || BADGE_SIZES["4x3"];
  const { style, root } = ensureNodes();
  root.innerHTML = cardHtml(person, cfg, nameSize(person.name || "", sizeKey));

  style.textContent =
    `#badge-print-root { display: none; }
    @media print {
      @page { size: ${size.w} ${size.h}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#badge-print-root) { display: none !important; }
      #badge-print-root {
        display: flex !important; position: fixed; inset: 0;
        width: ${size.w}; height: ${size.h};
        align-items: center; justify-content: center;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      ${CARD_CSS}
    }`;

  // Wait for the logo (if any) to load, then open the print sheet.
  whenReady(cfg, () => setTimeout(() => { try { window.print(); } catch { /* no-op */ } }, 60));
}

// Letter-size sheets of badges, N per page, for pre-printing at a badge table.
// Thin dashed cut guides; paginates with real page breaks.
export const BADGE_SHEETS = {
  "6up": { cols: 2, rows: 3, per: 6, npt: 22, label: 'Sheet — 6 per page (4 × 3")' },
  "8up": { cols: 2, rows: 4, per: 8, npt: 18, label: "Sheet — 8 per page (smaller)" },
};

export function printBadgeSheet(people, sheetKey = "6up") {
  const cfg = getEventConfig();
  const sh = BADGE_SHEETS[sheetKey] || BADGE_SHEETS["6up"];
  const list = (people || []).filter((p) => p && p.name);
  const { style, root } = ensureNodes();
  if (!list.length) return;

  const pages = [];
  for (let i = 0; i < list.length; i += sh.per) pages.push(list.slice(i, i + sh.per));
  root.innerHTML = pages
    .map((pg) => `<div class="bp-page">${pg.map((p) => `<div class="bp-cell">${cardHtml(p, cfg, shrinkFor(p.name, sh.npt))}</div>`).join("")}</div>`)
    .join("");

  style.textContent =
    `#badge-print-root { display: none; }
    @media print {
      @page { size: letter; margin: 0.4in; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#badge-print-root) { display: none !important; }
      #badge-print-root { display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bp-page {
        display: grid;
        grid-template-columns: repeat(${sh.cols}, 1fr);
        grid-template-rows: repeat(${sh.rows}, 1fr);
        width: 7.7in; height: 10.2in; break-after: page;
      }
      .bp-page:last-child { break-after: auto; }
      .bp-cell { border: 1px dashed #cfcfcf; display: flex; align-items: center; justify-content: center; overflow: hidden; break-inside: avoid; }
      ${CARD_CSS}
      .bp-logo { max-height: 0.6in; }
    }`;

  whenReady(cfg, () => setTimeout(() => { try { window.print(); } catch { /* no-op */ } }, 80));
}
