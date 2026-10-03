import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, "..", "public");
const splashDir = path.join(publicDir, "splash");
const logoPath = path.join(publicDir, "phoenix-logo.png");

const BACKGROUND = "#05070C";

/** Unique portrait splash sizes referenced by `lib/branding/ios-startup-images.ts`. */
const SPLASH_SIZES = [
  [750, 1334],
  [828, 1792],
  [1125, 2436],
  [1170, 2532],
  [1179, 2556],
  [1242, 2208],
  [1242, 2688],
  [1284, 2778],
  [1290, 2796],
];

async function renderSplash(width, height) {
  const logo = sharp(logoPath);
  const logoMeta = await logo.metadata();
  const maxLogoWidth = Math.round(width * 0.72);
  const maxLogoHeight = Math.round(height * 0.16);
  const logoWidth = logoMeta.width ?? 1;
  const logoHeight = logoMeta.height ?? 1;
  const widthScale = maxLogoWidth / logoWidth;
  const heightScale = maxLogoHeight / logoHeight;
  const scale = Math.min(widthScale, heightScale, 1);
  const targetWidth = Math.max(1, Math.round(logoWidth * scale));
  const targetHeight = Math.max(1, Math.round(logoHeight * scale));

  const resizedLogo = await logo
    .resize({ width: targetWidth, height: targetHeight, fit: "inside" })
    .png()
    .toBuffer();

  const left = Math.round((width - targetWidth) / 2);
  const top = Math.round((height - targetHeight) / 2 - height * 0.04);

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: resizedLogo, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  fs.mkdirSync(splashDir, { recursive: true });

  for (const [width, height] of SPLASH_SIZES) {
    const fileName = `ios-${width}x${height}.png`;
    const outputPath = path.join(splashDir, fileName);
    const buffer = await renderSplash(width, height);
    fs.writeFileSync(outputPath, buffer);
    process.stdout.write(`Wrote ${fileName}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
