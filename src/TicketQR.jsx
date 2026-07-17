import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

/* Real, scannable QR. Encodes the ticket token (an opaque 128-bit id) — the
   door scanner reads it and redeems it against /api/scan. Shared by the
   registration confirmation and the public ticket page. */
export default function TicketQR({ value, size = 116 }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(String(value || ""), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size * 3, // oversample for crisp rendering on retina screens
      color: { dark: "#0C2A20", light: "#FFFFFF" },
    })
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(""); });
    return () => { live = false; };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size, background: "#fff", borderRadius: 10 }} />;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Ticket QR code"
      style={{ background: "#fff", borderRadius: 10, padding: 6, display: "block" }}
    />
  );
}
