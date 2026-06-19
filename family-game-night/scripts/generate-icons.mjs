// Rasterizes public/icon.svg into all PWA icon sizes + a maskable variant +
// the Apple touch icon + a favicon. Run with: npm run icons
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "icon.svg");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(src);

// Standard icons (transparent rounded corners baked into the SVG).
const sizes = [192, 512];
for (const size of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(outDir, `icon-${size}.png`));
  console.log(`✓ icons/icon-${size}.png`);
}

// Apple touch icon (iOS prefers a filled, square 180x180 — no transparency).
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: "#7c3aed" })
  .png()
  .toFile(join(outDir, "apple-touch-icon.png"));
console.log("✓ icons/apple-touch-icon.png");

// Maskable 512: the art must sit inside the inner 80% "safe zone" so Android's
// mask (circle/squircle) never clips it. We shrink the art onto a full-bleed
// gradient background of the same brand color.
const safe = Math.round(512 * 0.8);
const inset = Math.round((512 - safe) / 2);
const artwork = await sharp(svg).resize(safe, safe).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#7c3aed" },
})
  .composite([{ input: artwork, top: inset, left: inset }])
  .png()
  .toFile(join(outDir, "icon-maskable-512.png"));
console.log("✓ icons/icon-maskable-512.png");

// favicon
await sharp(svg).resize(48, 48).png().toFile(join(root, "public", "favicon.png"));
console.log("✓ favicon.png");

// Also drop a copy of the source next to the icons for reference.
writeFileSync(join(outDir, "icon.svg"), svg);
console.log("All icons generated.");
