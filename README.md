# NewTabFeed

A local-first RSS reader in your new tab. Your feeds, on your device — no accounts, no cloud, no ads.

NewTabFeed replaces Chrome's new tab page with a clean reader for your RSS, Atom, and JSON feeds. Open a tab, read what's new. That's it.

## Local-first: your feeds, your device

- **Everything stays on your device.** No accounts, no sync servers, no telemetry. Your subscriptions and reading history never leave your browser.
- **No ads, no ranking, no algorithm.** Feeds show up newest-first. There is nothing to monetize and nothing to game.
- **Own your data.** Import and export your subscriptions as OPML at any time.
- **Minimal by design.** It shows your feeds when you open a tab. Feature creep is the enemy.

## Features

Phase 0 ships the project skeleton. The reader itself is built in the phases that follow:

- [ ] Fetch and parse RSS / Atom / RDF / JSON Feed on-device
- [ ] Card-grid new tab layout with favicons, source, and relative time
- [ ] First-run onboarding with curated starter feeds
- [ ] Add feeds by URL or by site (feed autodiscovery)
- [ ] OPML import / export
- [ ] "Light up" the toolbar icon when the current site publishes a feed
- [ ] Settings: refresh interval, density, theme

## Development

Requires [pnpm](https://pnpm.io) and Node 22+.

```bash
pnpm install          # install dependencies
pnpm dev              # run WXT with hot reload (Chrome)
pnpm build            # production build → .output/chrome-mv3
pnpm zip              # package a distributable zip
pnpm icons            # regenerate PNG icons from assets/icon.svg
```

Load the unpacked extension from `.output/chrome-mv3` at `chrome://extensions` (Developer mode → Load unpacked).

## Testing

```bash
pnpm test             # unit tests (Vitest + fakeBrowser)
pnpm test:watch       # unit tests in watch mode
pnpm test:e2e         # end-to-end tests (Playwright, builds first)
pnpm lint             # ESLint
pnpm format:check     # Prettier check
pnpm typecheck        # TypeScript, strict
```

End-to-end tests load the built extension into Playwright's bundled Chromium (Chrome and Edge no longer support the extension-loading flags).

## License

[MIT](./LICENSE) © Navendu Pottekkat
