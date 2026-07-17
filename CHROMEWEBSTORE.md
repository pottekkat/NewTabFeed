# Chrome Web Store listing

Prep and copy for the NewTabFeed Chrome Web Store submission. Keep this in sync
with each release.

Published at
<https://chromewebstore.google.com/detail/egiknghfofcepecblibbgdbncjmgglgj>.

## Listing

**Name:** NewTabFeed

**Summary (132 chars max):**
A local-first RSS reader in your new tab.

**Category:** Productivity

**Description:**

> Replace your new tab with a clean reader for the sites you actually follow.
>
> NewTabFeed shows your RSS, Atom, and JSON feeds newest-first every time you
> open a tab. There is no algorithm, no ranking, and no promoted posts. You pick
> every source, and everything stays on your device.
>
> Features:
>
> - A calm, card-grid new tab with favicons, source, and relative time.
> - Add feeds by URL, or discover them from the site you're on. The toolbar icon
>   lights up when a page publishes a feed, and can check common feed locations
>   when it doesn't.
> - Optional link previews: when an item ships no image or only a thin summary,
>   NewTabFeed fetches the linked article once for a cover image and
>   description. On by default, and you can turn it off in Settings.
> - Import and export your subscriptions as OPML.
> - Unread-only view, per-feed filtering, and mark-all-read.
> - Light and dark themes, comfortable or compact layouts.
> - Background refresh on a schedule you choose.
>
> Local-first and private: no accounts, no sync servers, no analytics, no ads.
> Your subscriptions and reading history never leave your browser.

_Write the description function-first, saying what the user gets, with no
implementation or framework details._

## Permission justifications

Every permission requested by the extension, and why it is needed. These must
match `wxt.config.ts` and the built `manifest.json`.

| Permission                              | Why it's needed                                                                                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                               | Persist your settings (theme, density, refresh interval, onboarding state) locally.                                                                                                                                                                                               |
| `unlimitedStorage`                      | Cache feed items in IndexedDB for offline reading without hitting the default storage quota.                                                                                                                                                                                      |
| `alarms`                                | Schedule periodic background refresh of your feeds at your chosen interval.                                                                                                                                                                                                       |
| `favicon`                               | Show each source's site icon via Chrome's local `_favicon/` API (no external icon service).                                                                                                                                                                                       |
| `tabs`                                  | Read the active tab's URL so the popup can offer to subscribe to that site's feed.                                                                                                                                                                                                |
| `scripting`                             | Register the feed-discovery content script at runtime, only after host access is granted.                                                                                                                                                                                         |
| `<all_urls>` (optional host permission) | Fetch the feeds you subscribe to from their own servers, probe a site for feeds when you ask, and, when link previews are on, fetch a subscribed item's article page once to read its cover image and description. Requested once, the first time you add a feed, not at install. |

## Privacy disclosures (Web Store form)

- **Does this item collect user data?** No.
- **Single purpose:** Display the user's subscribed web feeds on the new tab page.
- **Host permission justification:** `<all_urls>` is required to fetch
  user-chosen feed URLs (which may be on any site) directly from their origin,
  and, when link previews are on, the article page of an item in a feed the user
  subscribes to. The set of hosts is chosen by the user at runtime and cannot be
  known in advance, so no narrower match pattern is possible. It is an optional
  permission requested at first use, not at install.
- **Remote code:** None. All code is bundled in the package.
- **Data usage:** No data is collected, transmitted to the developer, sold, or
  shared. See [PRIVACY.md](./PRIVACY.md).

## Screenshots

The store takes 1280×800 (or 640×400) screenshots, at least one. We ship five,
in `docs/store/`:

- [x] `01` New tab card grid, light theme.
- [x] `02` New tab card grid, dark theme.
- [x] `03` First-run onboarding with starter feeds.
- [x] `04` Discovery popup, lit up on a site that advertises a feed.
- [x] `05` Manage feeds dialog (rename, remove, OPML import and export).

Run `pnpm screenshots` to regenerate them. Each one mounts the real UI inside a
mock browser window on a branded backdrop (see `e2e/frame.ts`), and the grid and
discovery shots pull live feeds, so they show real articles rather than
fixtures. That also means they need a network connection and are not
reproducible byte-for-byte. Re-run when the listing needs a refresh.

## Version history

- **0.1.1:** Copy only. The manifest description is now the one-line tagline,
  "A local-first RSS reader in your new tab." No functional change.
- **0.1.0:** Initial release. On-device RSS/Atom/RDF/JSON reading in the new tab,
  onboarding with starter feeds, feed discovery and well-known-path probing,
  optional link previews, OPML import and export, per-feed and unread-only
  filtering, themes, density, and scheduled background refresh.
