# Chrome Web Store listing prep

Copy/paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
Package with `pnpm package` (strips the local debug host; git keeps it for Load unpacked).

## Package

```bash
pnpm test
pnpm package
# → dist/actions-sidebar-folders-<version>.zip
```

- **Load unpacked (dev):** repo root (includes `http://127.0.0.1:3927/*` for `pnpm dev:logs`)
- **Store / GitHub Release asset:** `dist/actions-sidebar-folders-*.zip` only

## Store listing

| Field | Value |
|---|---|
| **Name** | Actions Sidebar Folders |
| **Summary** (≤132 chars) | Nest GitHub Actions sidebar workflows into folders by slash-separated name prefixes. |
| **Category** | Developer Tools |
| **Language** | English |
| **Homepage** | https://github.com/razbensimon/actions-sidebar-folders |
| **Support** | https://github.com/razbensimon/actions-sidebar-folders/issues |

### Description

```
Actions Sidebar Folders nests workflows in the GitHub Actions left sidebar when their names use slash-separated prefixes (for example CI / Lint / Unit).

Features
• Up to 3 folder levels from "/" in the workflow name
• Extra path segments stay on the leaf label
• Disabled workflows: hide (default), put in a Disabled folder, or leave flat
• Collapse folders by default (the path to the active workflow still expands)
• Works with GitHub’s Turbo / SPA navigation
• Options page only — no popup
• No analytics, no PAT, no third-party servers

Install tip: after installing, open any repository’s Actions tab on github.com.

Open source (MIT): https://github.com/razbensimon/actions-sidebar-folders
```

## Privacy tab

**Single purpose**

```
Organize the GitHub Actions sidebar by nesting workflows whose names contain slash-separated folder prefixes.
```

**Privacy policy URL** (must be public HTTPS)

```
https://github.com/razbensimon/actions-sidebar-folders/blob/main/PRIVACY.md
```

If the repo is still private, either make it public before submit, or host `PRIVACY.md` on a public HTTPS page (GitHub Pages / public gist) and paste that URL instead.

**Data use**

- Does not collect user data for remote processing
- Uses `storage` for extension settings only
- Remote code: **No**
- Certify limited use of the Chrome Web Store user data policy

### Permission justifications

**`storage`**

```
Stores the user’s options (disabled-workflow mode, collapse-folders default, debug toggle) via chrome.storage.sync. No other data is written.
```

**`https://github.com/*`**

```
Required to run the content script on GitHub Actions pages and to fetch GitHub’s same-origin workflows_partial HTML with the user’s existing session so the sidebar can be regrouped. No data is sent to extension developer servers.
```

Do **not** justify `http://127.0.0.1:3927/*` — it is removed by `pnpm package` and must not appear in the uploaded zip.

## Distribution

- Visibility: **Public** (or Unlisted for a soft launch)
- Pricing: Free

## Screenshots (required)

Chrome needs **at least one** image at **1280×800** or **640×400**.

Tracked asset (also shown in the README):

- [`store/screenshots/sidebar-folders.png`](./store/screenshots/sidebar-folders.png) — **1280×800**, UI letterboxed

Dashboard → Store listing → Screenshots → upload that file.

Optional extra: Options page at 1280×800 or 640×400.

## Reviewer notes (optional dashboard field)

```
Test: install → open https://github.com/<any-public-repo>/actions
Expect: workflow names with "/" appear as nested folders under All workflows and above Management.
Options: right-click extension → Options.
No account or API token required beyond a normal github.com session.
```

## Submit checklist

- [ ] `pnpm test` passes
- [ ] `pnpm package` zip used (not a zip of the raw git tree)
- [ ] Unzip and confirm `manifest.json` has only `https://github.com/*` under `host_permissions`
- [ ] Privacy policy URL loads without login
- [ ] ≥1 screenshot uploaded (1280×800 or 640×400)
- [ ] Permission justifications pasted
- [ ] Developer account: $5 paid, 2SV on, contact email verified
