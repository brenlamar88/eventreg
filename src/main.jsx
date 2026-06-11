import React from "react";
import { createRoot } from "react-dom/client";
import BoilOnTheBend from "./BoilOnTheBend.jsx";
import AuctionSettlement from "./AuctionSettlement.jsx";
import Sponsorships from "./Sponsorships.jsx";

// Public registration: "/"  |  Auction settlement: "/?app=settlement"  |  Sponsorships: "/?app=sponsorships"
const app = new URLSearchParams(window.location.search).get("app");
const App = app === "settlement" ? AuctionSettlement : app === "sponsorships" ? Sponsorships : BoilOnTheBend;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
