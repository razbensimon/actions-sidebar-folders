/**
 * Dev / debug helpers: snapshot state for DevTools inspection.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** @type {Record<string, unknown>} */
  const state = {
    enabled: false,
    lastRebuildAt: null,
    lastReason: null,
    settings: null,
    itemCount: 0,
    nestableCount: 0,
    disabledCount: 0,
    folderNames: [],
    showMorePresent: null,
    partialPagesFetched: null,
    lastError: null,
  };

  function updateDebug(patch) {
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    publish();
  }

  function publish() {
    // Visible when DevTools Console context = this content script.
    globalThis.__ASF_DEBUG__ = {
      ...state,
      help: [
        "Console context: pick this extension's content script (not 'top').",
        "Or read nav[data-asf-debug] in Elements.",
        "Call __ASF_DEBUG__.dump() for a logged snapshot.",
      ],
      dump() {
        console.log("[ASF] dump", { ...state });
        return { ...state };
      },
    };

    const nav = document.querySelector(
      globalThis.ASF?.SELECTORS?.nav || 'nav[aria-label="Actions workflows" i]'
    );
    if (nav) {
      if (state.enabled) {
        nav.setAttribute(
          "data-asf-debug",
          JSON.stringify({
            items: state.itemCount,
            nestable: state.nestableCount,
            disabled: state.disabledCount,
            folders: state.folderNames,
            showMore: state.showMorePresent,
            reason: state.lastReason,
            at: state.lastRebuildAt,
          })
        );
      } else {
        nav.removeAttribute("data-asf-debug");
      }
    }
  }

  function summarizeTree(tree) {
    return (tree || [])
      .filter((n) => n.type === "folder")
      .map((n) => n.name);
  }

  function detectShowMore(nav) {
    if (!nav) return false;
    if (nav.querySelector("[data-target='nav-list-group.showMoreItem']")) {
      return true;
    }
    const text = (nav.textContent || "").replace(/\s+/g, " ");
    return /Show more workflows/i.test(text);
  }

  return {
    debugState: state,
    updateDebug,
    publishDebug: publish,
    summarizeTree,
    detectShowMore,
  };
});
