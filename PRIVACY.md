# Privacy Policy

_Last updated: 2026-07-06_

NewTabFeed is a local-first RSS reader. It is built so that your data stays on
your device. This document explains, honestly, what it does and does not do.

## What NewTabFeed stores

All of the following live only in your browser, on your device:

- **Your subscriptions** — the feeds you add, plus any custom titles you set.
- **Feed items** — the articles fetched from your feeds, cached for offline reading.
- **Read state** — which items you've opened.
- **Settings** — theme, layout density, refresh interval, and similar preferences.

Subscriptions and items are stored in IndexedDB; settings are stored in the
extension's local storage. Nothing is written to a server we control, because
there is no such server.

## What NewTabFeed sends over the network

- **Feed fetches.** To show you new items, NewTabFeed fetches each feed you
  subscribe to **directly from that feed's own server** (for example, a blog's
  `/feed.xml`). These requests go to the sites you chose, and nowhere else.
- **Feed discovery / probing.** When you ask the popup to check the page you're
  on, or to "check common locations", NewTabFeed makes requests to **that site's
  origin only**, to see whether it publishes a feed.

That's the complete list. There are no requests to NewTabFeed servers, because
there are none.

## What NewTabFeed does NOT do

- **No accounts, no sign-in, no sync servers.**
- **No analytics, telemetry, or tracking** of any kind.
- **No advertising, and no selling or sharing of data.** There is no data to sell.
- **No third-party favicon service.** Site icons are rendered through Chrome's
  built-in `_favicon/` API, which serves icons from the browser's own local
  cache — NewTabFeed does not call any external favicon provider.

## Permissions

NewTabFeed requests the narrowest permissions it can. Host access to sites
(`<all_urls>`) is an **optional** permission that is requested only when you
first add a feed, so the browser shows a single, clear prompt — it is never
requested at install. See [CHROMEWEBSTORE.md](./CHROMEWEBSTORE.md) for the full
per-permission justification.

## Your control over your data

You can export all of your subscriptions to an OPML file at any time, and delete
any feed (and its cached items) from **Manage feeds**. Uninstalling the extension
removes all locally stored data.

## Contact

Questions about privacy can be raised as an issue on the project's GitHub
repository.
