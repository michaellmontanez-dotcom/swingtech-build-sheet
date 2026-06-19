"use client";

// The public origin used to build join links / QR codes. Prefers the explicit
// NEXT_PUBLIC_APP_URL override, else the current browser origin.
export function appOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function joinUrl(code: string): string {
  return `${appOrigin()}/join/${code}`;
}
