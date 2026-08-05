# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main` / the newest GitHub Release.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email the maintainer via GitHub: open a **private** security advisory on this repository  
(**Security** → **Advisories** → **New draft security advisory**), or contact the account that owns this repo.

Include:

- Extension version (`manifest.json` → `version`)
- Chrome version / OS
- Steps to reproduce
- Impact (e.g. unexpected network access, data exposure)

You should get an initial reply within a few days. We will coordinate a fix and public disclosure if needed.

## Scope notes

This extension only runs on `github.com` Actions pages, stores options in `chrome.storage.sync`, and does not talk to developer-operated servers. Store builds do not include the local debug host permission.
