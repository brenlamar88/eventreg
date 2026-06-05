import React from "react";
import { createRoot } from "react-dom/client";
import BoilOnTheBend from "./BoilOnTheBend.jsx";
import AuctionSettlement from "./AuctionSettlement.jsx";

// Public registration lives at "/". The organizer settlement console lives at
// "/?app=settlement" (gate it behind your own auth before sharing widely).
const isSettlement = new URLSearchParams(window.location.search).get("app") === "settlement";
const App = isSettlement ? AuctionSettlement : BoilOnTheBend;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
