/**
 * Genera assets del hero de email (cancha + overlay oscuro).
 * Uso: npx sharp scripts/generate-email-hero-assets.mjs
 * Requiere: npm install sharp --save-dev (o npx sharp)
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const W = 520;
const H = 220;

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    const require = createRequire(import.meta.url);
    sharp = require("sharp");
  }

  const courtPath = join(root, "public/images/cancha-riviera.jpg");
  const overlayPath = join(root, "public/images/email-hero-overlay.png");
  const backdropPath = join(root, "public/images/email-hero-backdrop.jpg");

  const gradientSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.58"/>
        <stop offset="42%" stop-color="#000" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#111113" stop-opacity="0.97"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;

  const court = await sharp(courtPath)
    .resize(W, H, { fit: "cover", position: "center" })
    .toBuffer();

  const overlayPng = await sharp(Buffer.from(gradientSvg)).png().toBuffer();

  await sharp(overlayPng).toFile(overlayPath);
  await sharp(court).composite([{ input: overlayPng, blend: "over" }]).jpeg({ quality: 88 }).toFile(backdropPath);

  console.log("Written:", overlayPath);
  console.log("Written:", backdropPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
