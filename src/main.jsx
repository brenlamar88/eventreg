import React from "react";
import { createRoot } from "react-dom/client";
import { loadEventConfig, applyTheme } from "./eventConfig.js";

// Public registration: "/"  |  Auction settlement: "/?app=settlement"
// Sponsorships: "/?app=sponsorships"  |  Event Setup: "/?app=setup"
// Ticket view (from the confirmation email / wallet pass): "/?ticket=<token>"
//
// The event config (white-label branding/copy/pricing) loads BEFORE the app
// modules are imported, so their module-level getEventConfig() reads see the
// resolved values. Cached config makes this instant after the first visit.
const params = new URLSearchParams(window.location.search);
const app = params.get("app");

async function boot() {
  const cfg = await loadEventConfig();
  applyTheme(cfg);
  document.title = cfg.eventName;

  const mod = params.get("invite")
    ? await import("./AcceptInvite.jsx")
    : params.get("ticket")
    ? await import("./TicketPage.jsx")
    : app === "settlement"
    ? await import("./AuctionSettlement.jsx")
    : app === "sponsorships"
    ? await import("./Sponsorships.jsx")
    : app === "setup"
    ? await import("./EventSetup.jsx")
    : app === "platform"
    ? await import("./PlatformAdmin.jsx")
    : app === "home"
    ? await import("./Marketing.jsx")
    : await import("./BoilOnTheBend.jsx");
  const App = mod.default;

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
boot();

// Offline app shell for the door iPads: after one online visit, the page
// itself loads with no connectivity (data + queued work live in IndexedDB).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
