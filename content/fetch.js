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

  const MAX_PARTIAL_PAGES = 50;

  function parseRepoFromLocation(pathname = location.pathname) {
    const parts = String(pathname).split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0] === "settings" || parts[0] === "organizations") return null;
    return { owner: parts[0], repo: parts[1] };
  }

  function isDisabledElement(li) {
    // GitHub renders: <span class="ActionListItem-visual--trailing"><span class="color-fg-muted text-small">Disabled</span>
    const trailing = li.querySelectorAll(
      ".ActionListItem-visual--trailing, .ActionListItem-description, .Label, .color-fg-muted"
    );
    for (const el of trailing) {
      if (/^\s*Disabled\s*$/i.test(el.textContent || "")) return true;
    }
    // Exact leaf text (avoids matching the whole row "Name Disabled")
    for (const el of li.querySelectorAll("span")) {
      if (
        el.children.length === 0 &&
        /^\s*Disabled\s*$/i.test(el.textContent || "")
      ) {
        return true;
      }
    }
    if (li.getAttribute("data-asf-disabled") === "1") return true;
    return false;
  }

  function parseWorkflowElement(li) {
    const anchor = li.querySelector("a.ActionListContent, a[href*='/actions/']");
    const label = li.querySelector(SELECTORS.label);
    // Prefer original slash path we stash when rendering (leaf labels are truncated).
    const name = (
      li.getAttribute("data-asf-full-name") ||
      label?.textContent ||
      ""
    ).trim();
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

  /**
   * Collapse items that share the same workflow href (e.g. numeric data-item-id
   * vs href-as-id after cache-created leaves omitted data-item-id).
   */
  function dedupeByHref(items) {
    const byHref = new Map();
    for (const item of items) {
      const key = item.href || `id:${item.id}`;
      const existing = byHref.get(key);
      if (!existing) {
        byHref.set(key, item);
        continue;
      }
      const merged = { ...existing };
      if (item.element?.isConnected) merged.element = item.element;
      else if (!existing.element?.isConnected && item.element) {
        merged.element = item.element;
      }
      const itemSlashes = (item.name.match(/\//g) || []).length;
      const existingSlashes = (existing.name.match(/\//g) || []).length;
      if (
        itemSlashes > existingSlashes ||
        (itemSlashes === existingSlashes &&
          item.name.length > existing.name.length)
      ) {
        merged.name = item.name;
      }
      // Prefer stable numeric workflow ids over href-as-id.
      if (/^\d+$/.test(String(item.id)) && !/^\d+$/.test(String(existing.id))) {
        merged.id = item.id;
      }
      if (item.href) merged.href = item.href;
      merged.disabled = existing.disabled || item.disabled;
      byHref.set(key, merged);
    }
    return [...byHref.values()];
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

  /**
   * Remove GitHub's paginated "Show more workflows..." control anywhere under nav.
   * It can sit as a div inside the list or as a sibling; match by several signals.
   */
  function removeShowMoreControls(root) {
    if (!root) return;
    const victims = new Set();

    root.querySelectorAll(SELECTORS.showMore).forEach((el) => victims.add(el));
    root.querySelectorAll("[src*='workflows_partial']").forEach((el) => {
      victims.add(el);
    });
    root.querySelectorAll("button, a, span, div").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Show more workflows/i.test(text) && text.length < 40) {
        // Prefer removing the ActionList row wrapper when present.
        const row =
          el.closest("[data-target='nav-list-group.showMoreItem']") ||
          el.closest(".ActionListItem") ||
          el;
        victims.add(row);
      }
    });

    for (const el of victims) {
      el.remove();
    }
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
      const merged = { ...existing };
      if (item.element?.isConnected) merged.element = item.element;
      else if (!existing.element?.isConnected && item.element) {
        merged.element = item.element;
      }
      const itemSlashes = (item.name.match(/\//g) || []).length;
      const existingSlashes = (existing.name.match(/\//g) || []).length;
      if (
        itemSlashes > existingSlashes ||
        (itemSlashes === existingSlashes && item.name.length > existing.name.length)
      ) {
        merged.name = item.name;
      }
      if (item.href) merged.href = item.href;
      merged.disabled = existing.disabled || item.disabled;
      byId.set(item.id, merged);
    };

    nav.querySelectorAll(SELECTORS.workflowItem).forEach(addEl);

    if (!repo) return [...byId.values()];

    try {
      // Read pagination hint before we strip the Show more control.
      const hintedPages = readTotalPages(nav);
      let page = 1;
      let consecutiveEmpty = 0;
      let pagesFetched = 0;

      globalThis.ASF?.log?.(
        "collect start",
        { hintedPages, domItems: byId.size }
      );

      while (page <= MAX_PARTIAL_PAGES) {
        // Parallelize the hinted range on the first wave.
        if (page === 1 && hintedPages > 1) {
          const htmlPages = await Promise.all(
            Array.from({ length: hintedPages }, (_, i) =>
              fetchPartialPage(repo, i + 1).catch(() => null)
            )
          );
          let lastCount = 0;
          for (const html of htmlPages) {
            pagesFetched += 1;
            if (!html) {
              consecutiveEmpty += 1;
              continue;
            }
            const els = parseWorkflowElementsFromHtml(html);
            lastCount = els.length;
            if (els.length === 0) consecutiveEmpty += 1;
            else consecutiveEmpty = 0;
            for (const el of els) addEl(el);
          }
          page = hintedPages + 1;
          if (lastCount === 0 || consecutiveEmpty > 0) break;
          continue;
        }

        const html = await fetchPartialPage(repo, page).catch(() => null);
        pagesFetched += 1;
        if (!html) break;
        const els = parseWorkflowElementsFromHtml(html);
        if (els.length === 0) break;
        for (const el of els) addEl(el);
        page += 1;
      }

      globalThis.ASF?.log?.("collect done", {
        pagesFetched,
        items: byId.size,
      });
      globalThis.ASF?.updateDebug?.({ partialPagesFetched: pagesFetched });
    } catch {
      // Fail open: DOM-only items already collected.
    }

    return dedupeByHref([...byId.values()]);
  }

  return {
    SELECTORS,
    parseRepoFromLocation,
    isDisabledElement,
    parseWorkflowElement,
    collectWorkflowItems,
    removeShowMoreControls,
    dedupeByHref,
  };
});
