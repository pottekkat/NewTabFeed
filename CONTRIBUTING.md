# Contributing to NewTabFeed

Thanks for taking the time to help. Bug reports, fixes, docs, and well-scoped features are all welcome. This guide covers how to file issues, what fits the project, and how to get set up.

Please be kind. Everyone here follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Scope and philosophy

NewTabFeed is deliberately small. It replaces the new tab with a newest-first reader for your feeds, and stores everything on your device: no accounts, no cloud, no sync servers, no telemetry, no ads. That constraint is the point, and it shapes what belongs here.

Some things will be declined by design. Anything that adds cloud services, accounts, sync backends, analytics, tracking, or ranking algorithms works against the local-first, private-by-default goal. Big features pull the project toward bloat, which is what we most want to avoid.

So before you write code for anything beyond a small fix, open an issue and describe the problem you want to solve. That saves you from building something that doesn't fit, and it gives us a chance to agree on the shape first.

## Reporting bugs

Open a [bug report](https://github.com/pottekkat/NewTabFeed/issues/new/choose) and fill in the template. A good report usually includes:

- What happened, and what you expected instead.
- The steps to reproduce it, in order.
- Your Chrome version, OS, and the NewTabFeed version.
- Any console errors or a screenshot, if you have them.

If a feed doesn't parse, the feed URL helps a lot, since we can test against it.

## Requesting features

Open a [feature request](https://github.com/pottekkat/NewTabFeed/issues/new/choose) and describe the problem behind the idea, not just the feature. Knowing what you're trying to do lets us find a solution that fits the small, local-first design, or explain why it doesn't.

## Development setup

You need [Node 22 or newer](https://nodejs.org) and [pnpm](https://pnpm.io).

Install dependencies:

```bash
pnpm install
```

## Running locally

For day-to-day work, run the dev build with hot reload:

```bash
pnpm dev
```

To try a production build the way a user would load it, build it and load it unpacked:

1. `pnpm build`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome-mv3`.
4. Open a new tab.

## Tests

The unit tests run in Node and are the fast loop:

```bash
pnpm test
```

Component and end-to-end tests drive a real browser, so they need Playwright's Chromium once:

```bash
pnpm exec playwright install chromium
```

Then:

```bash
pnpm test:components   # component tests (Vitest browser project)
pnpm test:e2e          # end-to-end tests (Playwright; builds the extension first)
```

The end-to-end suite runs against a local fixture server, so it never touches real feed sites.

## Before you open a PR

Run the same checks CI does, and make sure they all pass:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
```

Then open a pull request, link the issue it addresses, and fill in the template. Keep the change focused: one concern per PR is easier to review than a large mixed one. CI runs these checks on every PR, so anything red will need a fix before merge.

Maintainers cut releases by pushing a `v*` tag, so you don't need to bump versions in your PR. See [docs/RELEASING.md](./docs/RELEASING.md) if you're curious how that works.
