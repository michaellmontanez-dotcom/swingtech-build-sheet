"use client";

import { useState } from "react";
import { QRCode } from "@/components/QRCode";
import { ShareButton } from "@/components/ShareButton";
import { joinUrl } from "@/lib/origin";

// The "send it to other phones" panel: big room code, tappable join link, QR to
// scan, and a Web Share button.
export function InvitePanel({ code }: { code: string }) {
  const url = joinUrl(code);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card-surface p-5 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-white/60">Room code</p>
      <p className="my-1 text-6xl font-extrabold tracking-[0.3em] text-sunny drop-shadow">{code}</p>

      <div className="my-4 flex justify-center">
        <QRCode value={url} size={200} />
      </div>
      <p className="mb-3 text-sm text-white/70">Scan to join, or open the link:</p>

      <button onClick={copyLink} className="mb-3 block w-full truncate rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-sky-200 underline">
        {copied ? "✅ Copied!" : url}
      </button>

      <ShareButton url={url} code={code} />
    </div>
  );
}
