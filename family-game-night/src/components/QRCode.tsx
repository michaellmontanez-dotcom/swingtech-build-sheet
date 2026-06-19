"use client";

import { useEffect, useState } from "react";
import QR from "qrcode";

// Renders a scannable QR for the given URL. Other phones scan it to jump
// straight into the join flow.
export function QRCode({ value, size = 220 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    QR.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#2b1166", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [value, size]);

  if (!dataUrl) {
    return <div className="grid place-items-center rounded-2xl bg-white/20" style={{ width: size, height: size }}>…</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="Scan to join" width={size} height={size} className="rounded-2xl bg-white p-2 shadow-pop" />
  );
}
