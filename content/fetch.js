/**
 * Fetch and parse GitHub Actions workflow sidebar partials.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SELECTORS = {
    nav: 'nav[aria-label="Actions Workflows"]',
    workflowItem: 'li[data-test-selector="workflow-rendered"]',
    showMore: "[data-target='nav-list-group.showMoreItem']",
    label: ".ActionListItem-label",
  };

  function parseRepoFromLocation(pathname = location.pathname) {
    const parts = String(pathname).split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0] === "settings" || parts[0] === "organizations") return null;
    return { owner: parts[0], repo: parts[1] };
  }

  function isDisabledElement(li) {
    const labels = li.querySelectorAll(".Label, span[class*='Label']");
    for (const el of labels) {
      if (/^\s*Disabled\s*$/i.test(el.textContent || "")) return true;
    }
    const labelled = li.querySelector("[aria-label]");
    if (
      labelled &&
      /disabled/i.test(labelled.getAttribute("aria-label") || "")
    ) {
      return true;
    }
    return false;
  }

  function parseWorkflowElement(li) {
    const anchor = li.querySelector("a.ActionListContent, a[href*='/actions/']");
    const label = li.querySelector(SELECTORS.label);
    const name = (label?.textContent || "").trim();
    if (!name) return null;
    const id =
      li.getAttribute("data-item-id") ||
      anchor?.getAttribute("href") ||
      name;
    return {
      id: String(id),
      name,
      href: anchor?.getAttribute("href") || "",
      disabled: isDisabledElement(li),
      element: li,
    };
  }

  function parseWorkflowElementsFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll(SELECTORS.workflowItem)];
  }

  async function fetchPartialPage(repo, page) {
    const url = `/${repo.owner}/${repo.repo}/actions/workflows_partial?query=&page=${page}`;
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "text/html",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!res.ok) {
      throw new Error(`workflows_partial page ${page} failed: ${res.status}`);
    }
    return res.text();
  }

  function readTotalPages(nav) {
    const showMore = nav?.querySelector(SELECTORS.showMore);
    if (!showMore) return 1;
    const total = Number(showMore.getAttribute("data-total-pages") || "1");
    return Number.isFinite(total) && total > 0 ? total : 1;
  }

  async function collectWorkflowItems(nav) {
    const repo = parseRepoFromLocation();
    const byId = new Map();

    const addEl = (el) => {
      const item = parseWorkflowElement(el);
      if (!item) return;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        return;
      }
      // Prefer a live connected element when deduping.
      if (item.element?.isConnected && !existing.element?.isConnected) {
        byId.set(item.id, item);
      }
    };

    nav.querySelectorAll(SELECTORS.workflowItem).forEach(addEl);

    if (!repo) return [...byId.values()];

    try {
      const totalPages = readTotalPages(nav);
      const htmlPages = await Promise.all(
        Array.from({ length: totalPages }, (_, i) =>
          fetchPartialPage(repo, i + 1).catch(() => null)
        )
      );
      for (const html of htmlPages) {
        if (!html) continue;
        for (const el of parseWorkflowElementsFromHtml(html)) {
          addEl(el);
        }
      }
    } catch {
      // Fail open: DOM-only items already collected.
    }

    return [...byId.values()];
  }

  return {
    SELECTORS,
    parseRepoFromLocation,
    isDisabledElement,
    parseWorkflowElement,
    collectWorkflowItems,
  };
});
