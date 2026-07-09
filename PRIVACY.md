# Privacy Policy

_Last updated: 2026-07-09_

NewTabFeed is a local-first RSS reader. It is built so that your data stays on
your device. This document explains what it does and does not do.

## What NewTabFeed stores

All of the following live only in your browser, on your device:

- Your subscriptions: the feeds you add, plus any custom titles you set.
- Feed items: the articles fetched from your feeds, cached for offline reading.
- Read state: which items you've opened.
- Settings: theme, layout density, refresh interval, and similar preferences.

Subscriptions and items are stored in IndexedDB. Settings are stored in the
extension's local storage. Nothing is written to a server we control, because
there is no such server.

## What NewTabFeed sends over the network

To show you new items, NewTabFeed fetches each feed you subscribe to directly
from that feed's own server (for example, a blog's `/feed.xml`). These requests
go to the sites you chose, and nowhere else.

When you ask the popup to check the page you're on, or to check common
locations, NewTabFeed makes requests to that site's origin only, to see whether
it publishes a feed.

Link previews are optional and on by default. When a feed item ships no image or
only a thin summary, NewTabFeed fetches that item's article page once, straight
from its own site, and reads a cover image and description from the page's Open
Graph and meta tags. These requests carry no cookies. You can turn link previews
off in Settings.

To show a feed's favicon, NewTabFeed fetches the icon from that feed's own site
(its homepage `<link>` tags or `/favicon.ico`) and caches it locally. These
requests carry no cookies, and no third-party icon service is ever contacted.

That's the complete list.

## What NewTabFeed does not do

- No accounts, no sign-in, no sync servers.
- No analytics, telemetry, or tracking of any kind.
- No advertising, and no selling or sharing of data. There is no data to sell.
- No third-party favicon service. Icons come from each feed's own site, or from
  Chrome's built-in `_favicon/` cache as a fallback. NewTabFeed never calls an
  external icon provider.

## Permissions

NewTabFeed requests the narrowest permissions it can. Host access to sites
(`<all_urls>`) is an optional permission, requested only when you first add a
feed, so the browser shows a single, clear prompt. It is never requested at
install. See [CHROMEWEBSTORE.md](./CHROMEWEBSTORE.md) for the full per-permission
justification.

## Your control over your data

You can export all of your subscriptions to an OPML file at any time, and delete
any feed (and its cached items) from **Manage feeds**. Uninstalling the extension
removes all locally stored data.

## Contact

Questions about privacy can be raised as an issue on the project's GitHub
repository.
