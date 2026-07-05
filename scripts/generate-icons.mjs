import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

// Render the SVG source mark into the PNG sizes WXT picks up from public/icon/.
// Every size referenced by the manifest MUST exist as a real file at the
// correct pixel dimensions, so this script is the single source of truth.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const svgPath = resolve(root, 'assets/icon.svg');
const outDir = resolve(root, 'public/icon');
const sizes = [16, 32, 48, 96, 128];

await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  const out = resolve(outDir, `${size}.png`);
  await sharp(svgPath).resize(size, size).png().toFile(out);
  console.log(`generated ${out} (${size}x${size})`);
}
