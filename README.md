# Actions Sidebar Folders

Chrome extension (Manifest V3) that nests GitHub Actions sidebar workflows by slash-separated `name:` prefixes (up to 3 folder levels), with settings for disabled workflows.

Independently implemented from scratch. Inspired by the general idea of folder-grouping slash-named workflows — not a fork of any existing extension.

## Install (Load unpacked)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder
5. Open a repo’s **Actions** tab on github.com

## Settings

Right-click the extension → **Options** (or Details → Extension options):

| Setting | Default |
|---|---|
| Disabled workflows: Hide / Folder / Leave flat | **Hide** |
| Collapse folders by default | **On** (path to the active workflow still expands) |

Max folder depth is fixed at **3**. Extra `/` segments stay on the leaf label (`CI / Lint / JS / Unit / Foo` → folders `CI` → `Lint` → `JS`, leaf `Unit / Foo`).

## How it works

- Reads workflow rows from the Actions sidebar and GitHub’s same-origin `workflows_partial` HTML (your session cookies; **no PAT**)
- Splits names on `/` (whitespace around `/` is fine)
- Re-applies on Turbo / SPA navigations
- If fetch/parse fails, GitHub’s native sidebar is left alone

## Permissions

- `storage` — save options in Chrome sync
- `https://github.com/*` — content script + same-origin workflow list fetch

No analytics. No third-party servers.

## Development

```bash
npm test
```

## License

MIT
