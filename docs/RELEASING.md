# Releasing

Releases are cut by pushing a `v*` tag. The `release` workflow
(`.github/workflows/release.yml`) runs the full gate set, packages the
extension, and publishes a GitHub Release with the zip attached.

## Runbook

1. Bump `version` in `package.json` (and `manifest` if pinned elsewhere) and land it on `main`.
2. Tag the commit: `git tag v0.1.0`.
3. Push the tag: `git push origin v0.1.0`.
4. Watch the **Release** workflow—it runs lint/format/typecheck/tests/e2e, then `wxt zip`.
5. Confirm the GitHub Release and its `newtabfeed-<version>-chrome.zip` asset.

## Chrome Web Store (optional)

The store-upload step runs only when the `CWS_EXTENSION_ID` secret is set;
otherwise it is skipped and the GitHub Release is the only output. It uploads a
new **draft** version (`publish: false`) for manual review in the dashboard.

Configure these under **Settings → Secrets and variables → Actions** in the
GitHub repo:

- `CWS_EXTENSION_ID`—the extension's ID in the Web Store.
- `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`—OAuth credentials
  for the Chrome Web Store API (see the
  [`chrome-webstore-upload` docs](https://github.com/fregante/chrome-webstore-upload-keys)
  for generating them).
