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
  "4x3":      { w: "4in",   h: "3in",    label: 'Name badge — 4 × 3"' },
  "3.5x2.25": { w: "3.5in", h: "2.25in", label: 'Badge — 3.5 × 2.25"' },
  "brother62":{ w: "2.4in", h: "3.9in",  label: "Brother DK 62 mm" },
  "4x2":      { w: "4in",   h: "2in",    label: 'Label — 4 × 2"' },
};

const SIZE_KEY = "badge-size", AUTO_KEY = "badge-autoprint";
export const getBadgeSize = () => { try { return localStorage.getItem(SIZE_KEY) || "4x3"; } catch { return "4x3"; } };
export const setBadgeSize = (v) => { try { localStorage.setItem(SIZE_KEY, v); } catch { /* private mode */ } };
export const getAutoPrint = () => { try { return localStorage.getItem(AUTO_KEY) === "1"; } catch { return false; } };
export const setAutoPrint = (on) => { try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* private mode */ } };

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

export function printBadge(person, sizeKey = getBadgeSize()) {
  const cfg = getEventConfig();
  const size = BADGE_SIZES[sizeKey] || BADGE_SIZES["4x3"];
  const { style, root } = ensureNodes();
  const name = esc(person.name || "Guest");
  const org = esc(person.ranch || person.sponsorName || "");
  const bidder = esc(person.bidderNumber || "");
  const event = esc(cfg.eventName || "");
  const npt = nameSize(person.name || "", sizeKey);

  root.innerHTML =
    `<div class="bp-card">
      ${event ? `<div class="bp-event">${event}</div>` : ""}
      <div class="bp-name" style="font-size:${npt}pt">${name}</div>
      ${org ? `<div class="bp-org">${org}</div>` : ""}
      ${bidder ? `<div class="bp-bidder">BIDDER <b>#${bidder}</b></div>` : ""}
    </div>`;

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
      .bp-card {
        width: 100%; height: 100%; box-sizing: border-box;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; padding: 0.16in; color: #000;
        font-family: "Figtree", system-ui, sans-serif;
      }
      .bp-event { font-size: 9.5pt; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; margin-bottom: 0.07in; }
      .bp-name { font-weight: 700; line-height: 1.02; letter-spacing: -0.01em; }
      .bp-org { font-size: 12pt; margin-top: 0.07in; }
      .bp-bidder { font-size: 10.5pt; margin-top: 0.12in; letter-spacing: 0.08em; }
      .bp-bidder b { font-size: 15pt; }
    }`;

  // Let the style/markup apply, then open the print sheet.
  setTimeout(() => { try { window.print(); } catch { /* no-op */ } }, 60);
}
