/**
 * Content-script bootstrap: observe Actions sidebar and regroup workflows.
 */
(function () {
  "use strict";

  const ASF = globalThis.ASF;
  if (!ASF) return;

  const DEBOUNCE_MS = 150;
  let timer = null;
  let rebuilding = false;
  let lastKey = "";

  function onActionsPage() {
    return /\/actions(\/|$)/.test(location.pathname);
  }

  function scheduleRebuild(reason) {
    if (!onActionsPage()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      rebuild(reason).catch(() => {
        /* fail open */
      });
    }, DEBOUNCE_MS);
  }

  async function rebuild(reason) {
    if (rebuilding) return;
    const nav = document.querySelector(ASF.SELECTORS.nav);
    if (!nav) return;

    rebuilding = true;
    try {
      const settings = await ASF.loadSettings();
      const items = await ASF.collectWorkflowItems(nav);
      if (!items.length) return;

      const { nestable, disabledFolderItems } = ASF.applyDisabledPolicy(
        items,
        settings.disabledMode
      );
      const tree = ASF.buildTree(nestable);
      const key = JSON.stringify({
        path: location.pathname,
        mode: settings.disabledMode,
        collapse: settings.collapseFoldersByDefault,
        ids: items.map((i) => i.id).sort(),
        reason,
      });
      // Always render when settings/path change; skip only identical no-op
      if (key === lastKey && nav.querySelector("." + ASF.FOLDER_CLASS)) {
        return;
      }
      const ok = ASF.renderTree(nav, tree, settings, disabledFolderItems);
      if (ok) lastKey = key;
    } finally {
      rebuilding = false;
    }
  }

  function observe() {
    const observer = new MutationObserver((mutations) => {
      if (rebuilding) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.(ASF.SELECTORS.nav) ||
            node.querySelector?.(ASF.SELECTORS.nav) ||
            node.matches?.(ASF.SELECTORS.workflowItem) ||
            node.querySelector?.(ASF.SELECTORS.workflowItem)
          ) {
            scheduleRebuild("mutation");
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function listenSpa() {
    document.addEventListener("turbo:load", () => {
      lastKey = "";
      scheduleRebuild("turbo:load");
    });
    document.addEventListener("turbo:render", () => {
      lastKey = "";
      scheduleRebuild("turbo:render");
    });
    window.addEventListener("popstate", () => {
      lastKey = "";
      scheduleRebuild("popstate");
    });
  }

  function listenSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!changes.disabledMode && !changes.collapseFoldersByDefault) return;
      lastKey = "";
      scheduleRebuild("settings");
    });
  }

  observe();
  listenSpa();
  listenSettings();
  scheduleRebuild("init");
})();
