"use client";

import { useState } from "react";

// Uses the Web Share API so the host can text / AirDrop the join link. Falls
// back to copying the link to the clipboard where Share isn't available.
export function ShareButton({ url, code }: { url: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const shareData = {
      title: "Family Game Night",
      text: `Join my Game Night! Room ${code} 🎲`,
      url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <button className="btn-pink w-full" onClick={share}>
      {copied ? "✅ Link copied!" : "📲 Share invite"}
    </button>
  );
}
