/**
 * One-off generator for Android/iOS PWA manifest icons from the Phoenix favicon PNG.
 * Run: node frontend/scripts/generate-pwa-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(frontendRoot, "public", "phoenix-logo - favicon.png");
const outDir = join(frontendRoot, "public", "icons");

const background = { r: 5, g: 7, b: 12, alpha: 1 };

async function writeSquareIcon(size, filename, maskable) {
  const inset = maskable ? Math.round(size * 0.12) : 0;
  const inner = size - inset * 2;
  const logo = await sharp(sourcePath)
    .resize(inner, inner, { fit: "contain", background })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, top: inset, left: inset }])
    .png()
    .toFile(join(outDir, filename));
}

mkdirSync(outDir, { recursive: true });
await writeSquareIcon(192, "icon-192.png", false);
await writeSquareIcon(512, "icon-512.png", false);
await writeSquareIcon(512, "icon-512-maskable.png", true);

console.log("Wrote public/icons/icon-192.png, icon-512.png, icon-512-maskable.png");
