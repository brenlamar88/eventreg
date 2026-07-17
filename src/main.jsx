import React from "react";
import { createRoot } from "react-dom/client";
import BoilOnTheBend from "./BoilOnTheBend.jsx";
import AuctionSettlement from "./AuctionSettlement.jsx";
import Sponsorships from "./Sponsorships.jsx";
import TicketPage from "./TicketPage.jsx";

// Public registration: "/"  |  Auction settlement: "/?app=settlement"  |  Sponsorships: "/?app=sponsorships"
// Ticket view (from the confirmation email / wallet pass): "/?ticket=<token>"
const params = new URLSearchParams(window.location.search);
const app = params.get("app");
const App = params.get("ticket") ? TicketPage
  : app === "settlement" ? AuctionSettlement
  : app === "sponsorships" ? Sponsorships
  : BoilOnTheBend;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
