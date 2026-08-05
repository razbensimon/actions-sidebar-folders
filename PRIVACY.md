# Privacy Policy — Actions Sidebar Folders

**Last updated:** 5 August 2026

This privacy policy applies to the **Actions Sidebar Folders** Chrome extension (“the Extension”), published by the maintainer of [github.com/razbensimon/actions-sidebar-folders](https://github.com/razbensimon/actions-sidebar-folders).

## What the Extension does

The Extension rearranges the GitHub Actions sidebar on `github.com` so workflows whose names contain `/` appear in nested folders. It runs only on GitHub Actions pages in your browser.

## Data we collect

**We do not collect, transmit, sell, or share personal data with any third-party server operated by us.**

Specifically:

- **No analytics** — no usage tracking, crash reporting, or advertising SDKs.
- **No accounts** — the Extension does not create accounts or require sign-in beyond your existing GitHub session in the browser.
- **No remote backends** — the Extension does not send workflow lists, repository names, or browsing history to our servers (we do not operate one for this product).

## Data stored on your device

The Extension uses Chrome’s `storage.sync` API to save your preferences only:

- How to treat disabled workflows (hide / folder / flat)
- Whether folders start collapsed
- Whether debug mode is enabled

These settings may sync across Chrome browsers where you are signed into the same Google account, according to Chrome’s sync behavior. They never leave Chrome sync for our systems.

## Access to GitHub

The Extension injects a content script on GitHub Actions URLs and may read the Actions sidebar DOM and GitHub’s same-origin `workflows_partial` HTML using **your existing browser session cookies**. That access stays inside your browser session with GitHub. We do not receive a copy of that data.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save options listed above |
| `https://github.com/*` | Run on Actions pages and fetch the same-origin workflow list partial |

## Children’s privacy

The Extension is not directed at children and does not knowingly collect children’s data.

## Changes

We may update this policy when the Extension’s behavior changes. The “Last updated” date at the top will change, and a new version of the Extension may be published.

## Contact

Open an issue on the project repository:  
https://github.com/razbensimon/actions-sidebar-folders/issues
