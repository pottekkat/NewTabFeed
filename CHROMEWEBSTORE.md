# Chrome Web Store Listing

Prep and copy for the NewTabFeed Chrome Web Store submission. Keep this in sync
with each release.

## Listing

**Name:** NewTabFeed

**Summary (132 chars max):**
A local-first RSS reader in your new tab. Your feeds, newest-first — no accounts, no cloud, no ads.

**Category:** Productivity

**Description:**

> Replace your new tab with a clean reader for the sites you actually follow.
>
> NewTabFeed shows your RSS, Atom, and JSON feeds newest-first every time you
> open a tab — no algorithm, no ranking, no promoted posts. You pick every
> source, and everything stays on your device.
>
> Features:
>
> - A calm, card-grid new tab with favicons, source, and relative time.
> - Add feeds by URL, or discover them from the site you're on: the toolbar icon
>   lights up when a page publishes a feed, and can check common feed locations
>   when it doesn't.
> - Import and export your subscriptions as OPML.
> - Unread-only view, per-feed filtering, and mark-all-read.
> - Light and dark themes, comfortable or compact layouts.
> - Background refresh on a schedule you choose.
>
> Local-first and private: no accounts, no sync servers, no analytics, no ads.
> Your subscriptions and reading history never leave your browser.

_Write the description function-first — what the user gets — with no
implementation or framework details._

## Permission justifications

Every permission requested by the extension, and why it is needed. These must
match `wxt.config.ts` and the built `manifest.json`.

| Permission                              | Why it's needed                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                               | Persist your settings (theme, density, refresh interval, onboarding state) locally.                                                                                        |
| `unlimitedStorage`                      | Cache feed items in IndexedDB for offline reading without hitting the default storage quota.                                                                               |
| `alarms`                                | Schedule periodic background refresh of your feeds at your chosen interval.                                                                                                |
| `favicon`                               | Show each source's site icon via Chrome's local `_favicon/` API (no external icon service).                                                                                |
| `tabs`                                  | Read the active tab's URL so the popup can offer to subscribe to that site's feed.                                                                                         |
| `scripting`                             | Register the feed-discovery content script at runtime, only after host access is granted.                                                                                  |
| `<all_urls>` (optional host permission) | Fetch the feeds you subscribe to directly from their own servers, and probe a site for feeds when you ask. Requested once, the first time you add a feed — not at install. |

## Privacy disclosures (Web Store form)

- **Does this item collect user data?** No.
- **Single purpose:** Display the user's subscribed web feeds on the new tab page.
- **Host permission justification:** `<all_urls>` is required to fetch arbitrary
  user-chosen feed URLs (any site) directly from their origin. It is an optional
  permission requested at first use, not at install.
- **Remote code:** None. All code is bundled in the package.
- **Data usage:** No data is collected, transmitted to the developer, sold, or
  shared. See [PRIVACY.md](./PRIVACY.md).

## Screenshot checklist

Provide at least one 1280×800 (or 640×400) screenshot. Recommended set:

- [ ] New tab card grid populated with real feeds (light theme).
- [ ] New tab card grid (dark theme).
- [ ] First-run onboarding with starter feeds.
- [ ] Discovery popup lit up on a site that advertises a feed.
- [ ] Manage feeds dialog (rename / remove / OPML import-export).

_Light and dark new-tab captures live in `docs/screenshots/` (1280×800, fixture
data). Replace with real-content captures before submission._

## Version history

- **0.1.0** — Initial release. On-device RSS/Atom/JSON reading in the new tab,
  onboarding with starter feeds, feed discovery + well-known-path probing, OPML
  import/export, per-feed and unread-only filtering, themes, density, and
  scheduled background refresh.
