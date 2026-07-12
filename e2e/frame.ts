// Store-screenshot compositor. Takes a raw capture of the real extension UI and
// mounts it inside a mock browser window on a branded backdrop, so the Chrome
// Web Store shots read as "here is the product in a browser" rather than a bare
// screenshot. The chrome (title strip, toolbar, URL pill, action icons) is all
// CSS and inline SVG; the only real pixels are the app capture we drop in.
//
// Everything renders at exactly 1280x800, the store's preferred screenshot size.

import type { BrowserContext } from '@playwright/test';

const WIDTH = 1280;
const HEIGHT = 800;

// The mock window: 928 wide leaves even 176px gutters; the 20px title strip plus
// 56px toolbar leave a 580px content area, which is exactly 928 at the app
// capture's 1280x800 (0.625) aspect. So a 1280x800 capture drops in with no crop.
const WINDOW = { left: 176, top: 100, width: 928, height: 656 } as const;
const TITLEBAR = 20;
const TOOLBAR = 56;

// In `bare` mode there's no backdrop, so the canvas is just the window plus a
// margin wide enough for its drop shadow to fall on the transparent background.
const SHADOW_PAD = 72;

export type Theme = 'light' | 'dark';

export interface Headline {
  /** Leading text in the base color. */
  base: string;
  /** Trailing text in the brand accent color. */
  accent: string;
}

export interface FrameOptions {
  /** PNG of the real app UI, shown inside the window. Base64 (no data: prefix). */
  innerPngBase64: string;
  theme: Theme;
  /** The headline above the window. Omit in `bare` mode, which has no headline. */
  headline?: Headline;
  /** URL-bar text. Omit for a new-tab shot, which shows a search omnibox. */
  url?: string;
  /**
   * Optional popup overlay, floated under the toolbar's extension icon over a
   * dimmed backdrop (for the discovery shot). Base64 PNG, no data: prefix.
   */
  overlayPngBase64?: string;
  /**
   * Bare mode: just the mock window on a transparent canvas, with no headline
   * and no branded backdrop. Used for the README hero, which sits on GitHub's
   * own page background rather than a store card.
   */
  bare?: boolean;
}

const BRAND = '#f97316';

// Toolbar glyphs, 18px, drawn with currentColor so the theme tints them. The
// NewTabFeed icon is the one exception: it keeps its orange so it reads as "our
// extension is pinned here", the way NSFW Filter highlights its own icon.
const icons = {
  star: '<path d="M9 2.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L9 12.3 5.2 14.3l.7-4.3-3.1-3 4.3-.6z"/>',
  share:
    '<circle cx="13.5" cy="4" r="2"/><circle cx="4.5" cy="9" r="2"/><circle cx="13.5" cy="14" r="2"/><path d="M6.3 8L11.7 5M6.3 10l5.4 3"/>',
  puzzle:
    '<path d="M7 2.5h1.6a1 1 0 011 1V5a1.2 1.2 0 002.4 0V3.5a1 1 0 011-1H15v3.2h1.3a1.2 1.2 0 010 2.4H15V13a1 1 0 01-1 1h-2.3v-1.3a1.2 1.2 0 00-2.4 0V14H7a1 1 0 01-1-1v-2.5H4.7a1.2 1.2 0 010-2.4H6V3.5a1 1 0 011-1z" transform="scale(0.95) translate(0.4 0.4)"/>',
  sidebar:
    '<rect x="2.5" y="3" width="13" height="12" rx="1.6"/><line x1="7" y1="3" x2="7" y2="15"/>',
  kebab:
    '<circle cx="9" cy="3.5" r="1.3"/><circle cx="9" cy="9" r="1.3"/><circle cx="9" cy="14.5" r="1.3"/>',
  search:
    '<circle cx="8" cy="8" r="5"/><line x1="11.6" y1="11.6" x2="15" y2="15"/>',
  lock: '<rect x="3.5" y="7" width="11" height="7.5" rx="1.5"/><path d="M6 7V5a3 3 0 016 0v2"/>',
};

function svg(
  path: string,
  opts: { fill?: boolean; color?: string } = {},
): string {
  const stroke = opts.fill ? 'none' : 'currentColor';
  const fill = opts.fill ? 'currentColor' : 'none';
  const color = opts.color ? `color:${opts.color};` : '';
  return `<svg viewBox="0 0 18 18" width="18" height="18" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="${color}display:block">${path}</svg>`;
}

// The pinned NewTabFeed icon: orange rounded square with the RSS mark, matching
// assets/icon.svg. Sits highlighted in the toolbar action row.
const brandIcon = `
  <span class="brand-icon">
    <svg viewBox="0 0 128 128" width="16" height="16">
      <rect width="128" height="128" rx="28" fill="#F97316"/>
      <g stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none">
        <path d="M38 62 A28 28 0 0 1 66 90"/>
        <path d="M38 40 A50 50 0 0 1 88 90"/>
      </g>
      <circle cx="38" cy="90" r="11" fill="#fff"/>
    </svg>
  </span>`;

function palette(theme: Theme) {
  if (theme === 'dark') {
    return {
      pageBg: `radial-gradient(circle at 26% 12%, rgba(249,115,22,0.16), transparent 46%), radial-gradient(circle at 88% 92%, rgba(249,115,22,0.10), transparent 44%), linear-gradient(160deg, #0b0f1a, #0d1420)`,
      headline: '#f1f5f9',
      titlebar: '#1b2333',
      toolbar: '#121a28',
      toolbarBorder: 'rgba(148,163,184,0.14)',
      pill: '#212c3d',
      pillText: '#9fb0c6',
      iconColor: '#93a3ba',
      brandTint: 'rgba(249,115,22,0.20)',
      windowBorder: 'rgba(148,163,184,0.16)',
      contentBg: '#0b1220',
    };
  }
  return {
    pageBg: `radial-gradient(circle at 26% 12%, rgba(249,115,22,0.10), transparent 46%), radial-gradient(circle at 88% 92%, rgba(249,115,22,0.08), transparent 44%), linear-gradient(160deg, #f7f8fc, #eef0f8)`,
    headline: '#0f172a',
    titlebar: '#e6e8ee',
    toolbar: '#f4f5f8',
    toolbarBorder: 'rgba(15,23,42,0.08)',
    pill: '#eceef2',
    pillText: '#5b667a',
    iconColor: '#5b667a',
    brandTint: 'rgba(249,115,22,0.14)',
    windowBorder: 'rgba(15,23,42,0.08)',
    contentBg: '#ffffff',
  };
}

function buildHtml(opts: FrameOptions): string {
  const p = palette(opts.theme);
  const accent = opts.theme === 'dark' ? BRAND : '#ea580c';

  const leadIcon = opts.url ? icons.lock : icons.search;
  const urlText = opts.url ?? 'Search or type a URL';

  const rightIcons = [
    svg(icons.star),
    svg(icons.share),
    `<span class="brand-highlight">${brandIcon}</span>`,
    svg(icons.puzzle, { fill: true }),
    svg(icons.sidebar),
    `<span class="avatar"></span>`,
    svg(icons.kebab, { fill: true }),
  ]
    .map((s) => `<span class="tb-icon">${s}</span>`)
    .join('');

  const overlay = opts.overlayPngBase64
    ? `<img class="overlay" src="data:image/png;base64,${opts.overlayPngBase64}" alt=""/>`
    : '';
  const dimClass = opts.overlayPngBase64 ? ' dimmed' : '';

  // Bare mode drops the backdrop and headline and sizes the canvas to the window
  // plus a shadow margin; the framed store shot fills the full 1280x800 card.
  const pageW = opts.bare ? WINDOW.width + SHADOW_PAD * 2 : WIDTH;
  const pageH = opts.bare ? WINDOW.height + SHADOW_PAD * 2 : HEIGHT;
  const winLeft = opts.bare ? SHADOW_PAD : WINDOW.left;
  const winTop = opts.bare ? SHADOW_PAD : WINDOW.top;
  const bodyBg = opts.bare ? 'transparent' : p.pageBg;
  const headlineHtml =
    opts.bare || !opts.headline
      ? ''
      : `<div class="headline">${opts.headline.base} <span class="accent">${opts.headline.accent}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${pageW}px; height: ${pageH}px; overflow: hidden;
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body { position: relative; background: ${bodyBg}; }
  .headline {
    position: absolute; top: 36px; left: 0; right: 0; text-align: center;
    font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: ${p.headline};
  }
  .headline .accent { color: ${accent}; }
  .window {
    position: absolute; left: ${winLeft}px; top: ${winTop}px;
    width: ${WINDOW.width}px; height: ${WINDOW.height}px;
    border-radius: 13px; overflow: hidden;
    background: ${p.contentBg};
    border: 1px solid ${p.windowBorder};
    box-shadow: 0 2px 6px rgba(15,23,42,0.06), 0 26px 70px rgba(15,23,42,0.22);
  }
  .titlebar { height: ${TITLEBAR}px; background: ${p.titlebar}; }
  .toolbar {
    height: ${TOOLBAR}px; background: ${p.toolbar};
    border-bottom: 1px solid ${p.toolbarBorder};
    display: flex; align-items: center; gap: 10px; padding: 0 16px;
  }
  .pill {
    flex: 1; height: 30px; border-radius: 15px; background: ${p.pill};
    display: flex; align-items: center; gap: 8px; padding: 0 14px;
    color: ${p.pillText}; font-size: 13px;
  }
  .pill svg { width: 14px; height: 14px; opacity: 0.8; }
  .tb-icon { color: ${p.iconColor}; display: flex; align-items: center; }
  .brand-highlight {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 7px; background: ${p.brandTint};
  }
  .brand-icon { display: flex; }
  .avatar {
    width: 18px; height: 18px; border-radius: 50%;
    background: linear-gradient(135deg, #94a3b8, #64748b);
  }
  .content { position: relative; height: ${WINDOW.height - TITLEBAR - TOOLBAR}px; }
  .content .app {
    width: 100%; height: 100%; object-fit: cover; object-position: top center;
    display: block;
  }
  .content.dimmed .app { filter: brightness(0.62) saturate(0.9); }
  .content.dimmed::after {
    content: ""; position: absolute; inset: 0; background: rgba(9,13,22,0.28);
  }
  .overlay {
    position: absolute; top: 8px; right: 96px; width: 300px;
    border-radius: 12px; border: 1px solid rgba(15,23,42,0.10);
    box-shadow: 0 24px 60px rgba(9,13,22,0.42);
  }
  </style></head><body>
    ${headlineHtml}
    <div class="window">
      <div class="titlebar"></div>
      <div class="toolbar">
        <div class="pill">${svg(leadIcon)}<span>${urlText}</span></div>
        ${rightIcons}
      </div>
      <div class="content${dimClass}">
        <img class="app" src="data:image/png;base64,${opts.innerPngBase64}" alt=""/>
        ${overlay}
      </div>
    </div>
  </body></html>`;
}

/**
 * Composite a mock-browser shot and save it to `outPath`. The default is a
 * framed 1280x800 store card; `opts.bare` renders just the window on a
 * transparent canvas (README hero). Renders the HTML on a throwaway page, waits
 * for the embedded images to decode, then screenshots the viewport.
 */
export async function renderFramedShot(
  context: BrowserContext,
  outPath: string,
  opts: FrameOptions,
): Promise<void> {
  const width = opts.bare ? WINDOW.width + SHADOW_PAD * 2 : WIDTH;
  const height = opts.bare ? WINDOW.height + SHADOW_PAD * 2 : HEIGHT;
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.setContent(buildHtml(opts), { waitUntil: 'load' });
    // Ensure both the app capture and any overlay have decoded before shooting.
    await page.evaluate(() =>
      Promise.all(
        [...document.images].map((img) => img.decode().catch(() => {})),
      ),
    );
    // Bare mode keeps the canvas transparent so the window's shadow blends onto
    // whatever page it's embedded in.
    await page.screenshot({ path: outPath, omitBackground: opts.bare });
  } finally {
    await page.close();
  }
}
