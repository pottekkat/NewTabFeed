// Render the Chrome Web Store and GitHub marketing tiles to PNG at exact sizes.
//
// Each tile is a self-contained HTML page (inline CSS, the app icon inlined as a
// data URI, no network) rendered headless by Playwright's Chromium and shot at
// its precise pixel size. No extension is loaded—these are pure marketing
// images, so they don't need the e2e harness. Run with `pnpm marketing`.

import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'docs/store');
mkdirSync(outDir, { recursive: true });

// Inline the source mark as a data URI so the template pulls nothing off disk
// at render time.
const iconSvg = readFileSync(resolve(root, 'assets/icon.svg'), 'utf8');
const iconUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

const ORANGE = '#f97316';

/**
 * One marketing tile. `variant` picks the layout: 'compact' for the small
 * promo, 'wide' for the marquee and social preview.
 */
function tileHtml({ width, height, variant }) {
  const compact = variant === 'compact';
  const iconSize = compact ? 72 : 132;
  const nameSize = compact ? 40 : 84;
  const tagSize = compact ? 17 : 30;
  const gap = compact ? 18 : 34;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background:
      radial-gradient(circle at 18% 22%, rgba(249, 115, 22, 0.16), transparent 60%),
      radial-gradient(circle at 88% 90%, rgba(249, 115, 22, 0.10), transparent 55%),
      #fbfaf8;
  }
  .tile {
    display: flex;
    ${compact ? 'flex-direction: column; text-align: center; align-items: center;' : 'align-items: center;'}
    gap: ${gap}px;
    padding: ${compact ? '28px' : '0 96px'};
  }
  .icon {
    width: ${iconSize}px;
    height: ${iconSize}px;
    border-radius: ${Math.round(iconSize * 0.22)}px;
    box-shadow: 0 12px 32px rgba(249, 115, 22, 0.32);
    flex-shrink: 0;
  }
  .name {
    font-size: ${nameSize}px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .name b { color: ${ORANGE}; font-weight: 700; }
  .tag {
    margin-top: ${compact ? 10 : 18}px;
    font-size: ${tagSize}px;
    font-weight: 500;
    color: #475569;
    line-height: 1.35;
    ${compact ? '' : 'max-width: 720px;'}
  }
  .sub {
    margin-top: ${compact ? 6 : 12}px;
    font-size: ${compact ? 13 : 19}px;
    color: #94a3b8;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="tile">
    <img class="icon" src="${iconUri}" alt="" />
    <div class="copy">
      <div class="name">NewTab<b>Feed</b></div>
      <div class="tag">A local-first RSS reader in your new tab</div>
      ${compact ? '' : '<div class="sub">Your feeds, on your device. No accounts, no cloud, no ads.</div>'}
    </div>
  </div>
</body>
</html>`;
}

const TILES = [
  { file: 'promo-small.png', width: 440, height: 280, variant: 'compact' },
  { file: 'promo-marquee.png', width: 1400, height: 560, variant: 'wide' },
  { file: 'social-preview.png', width: 1280, height: 640, variant: 'wide' },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const tile of TILES) {
    await page.setViewportSize({ width: tile.width, height: tile.height });
    await page.setContent(tileHtml(tile), { waitUntil: 'load' });
    const out = resolve(outDir, tile.file);
    await page.screenshot({
      path: out,
      clip: { x: 0, y: 0, width: tile.width, height: tile.height },
    });
    console.log(`wrote ${out} (${tile.width}x${tile.height})`);
  }
} finally {
  await browser.close();
}
