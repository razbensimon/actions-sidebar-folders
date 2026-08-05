/**
 * Content-script bootstrap: observe Actions sidebar and regroup workflows.
 */
(function () {
  "use strict";

  const ASF = globalThis.ASF;
  if (!ASF) return;

  const DEBOUNCE_MS = 32;
  const FAIL_OPEN_MS = 4000;
  const READY_ATTR = "data-asf-ready";
  let timer = null;
  let failOpenTimer = null;
  let rebuilding = false;
  let lastKey = "";

  function onActionsPage() {
    return /\/actions(\/|$)/.test(location.pathname);
  }

  function markPending(nav) {
    if (!nav) nav = document.querySelector(ASF.SELECTORS?.nav);
    if (!nav) return;
    nav.removeAttribute(READY_ATTR);
    clearTimeout(failOpenTimer);
    failOpenTimer = setTimeout(() => {
      const n = document.querySelector(ASF.SELECTORS?.nav);
      if (n && !n.hasAttribute(READY_ATTR)) {
        n.setAttribute(READY_ATTR, "1");
        ASF.warn?.("fail-open: showed native list after timeout");
      }
    }, FAIL_OPEN_MS);
  }

  function markReady(nav) {
    if (!nav) return;
    // Drop GitHub re-injected flat rows before revealing.
    ASF.pruneStrayNativeWorkflows?.(nav);
    nav.setAttribute(READY_ATTR, "1");
    clearTimeout(failOpenTimer);
  }

  function cacheKey(repo) {
    // v3: invalidate caches that mixed href-ids with numeric workflow ids.
    return `asf:workflows:v3:${repo.owner}/${repo.repo}`;
  }

  function readCache(repo) {
    if (!repo) return null;
    try {
      const raw = sessionStorage.getItem(cacheKey(repo));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      // Defensive dedupe for any stale shape.
      return ASF.dedupeByHref ? ASF.dedupeByHref(parsed) : parsed;
    } catch {
      return null;
    }
  }

  function writeCache(repo, items) {
    if (!repo || !items?.length) return;
    try {
      const deduped = ASF.dedupeByHref ? ASF.dedupeByHref(items) : items;
      const slim = deduped.map((i) => ({
        id: i.id,
        name: i.name,
        href: i.href,
        disabled: Boolean(i.disabled),
      }));
      sessionStorage.setItem(cacheKey(repo), JSON.stringify(slim));
    } catch {
      /* quota / private mode */
    }
  }

  function paint(nav, items, settings) {
    const { nestable, disabledFolderItems } = ASF.applyDisabledPolicy(
      items,
      settings.disabledMode
    );
    const tree = ASF.buildTree(nestable);
    const ok = ASF.renderTree(nav, tree, settings, disabledFolderItems);
    if (ok) {
      ASF.removeShowMoreControls?.(nav);
      markReady(nav);
    }
    return {
      ok,
      nestable,
      disabledFolderItems,
      tree,
    };
  }

  function scheduleRebuild(reason) {
    if (!onActionsPage()) return;
    markPending();
    clearTimeout(timer);
    timer = setTimeout(() => {
      rebuild(reason).catch((err) => {
        ASF.warn?.("rebuild failed", err);
        ASF.updateDebug?.({ lastError: String(err?.message || err) });
        const nav = document.querySelector(ASF.SELECTORS.nav);
        markReady(nav); // fail open
      });
    }, DEBOUNCE_MS);
  }

  async function rebuild(reason) {
    if (rebuilding) return;
    const nav = document.querySelector(ASF.SELECTORS.nav);
    if (!nav) {
      ASF.log?.("no Actions Workflows nav yet", reason);
      return;
    }

    rebuilding = true;
    const t0 = performance.now();
    markPending(nav);

    try {
      const settings = await ASF.loadSettings();
      ASF.setDebugEnabled?.(settings.debugMode);
      ASF.updateDebug?.({
        enabled: settings.debugMode,
        settings,
        lastReason: reason,
      });

      ASF.log?.("rebuild start", { reason, path: location.pathname });

      const repo = ASF.parseRepoFromLocation?.();
      const cached = readCache(repo);
      if (cached?.length && !nav.querySelector("." + ASF.FOLDER_CLASS)) {
        ASF.log?.("optimistic paint from cache", { items: cached.length });
        paint(nav, cached, settings);
      }

      const items = await ASF.collectWorkflowItems(nav);
      if (!items.length) {
        ASF.warn?.("no workflow items collected");
        ASF.updateDebug?.({
          itemCount: 0,
          lastRebuildAt: new Date().toISOString(),
        });
        markReady(nav);
        return;
      }

      writeCache(repo, items);

      const { nestable, disabledFolderItems } = ASF.applyDisabledPolicy(
        items,
        settings.disabledMode
      );
      const tree = ASF.buildTree(nestable);
      const key = JSON.stringify({
        path: location.pathname,
        mode: settings.disabledMode,
        collapse: settings.collapseFoldersByDefault,
        debug: settings.debugMode,
        ids: items.map((i) => i.id).sort(),
      });

      if (key === lastKey && nav.querySelector("." + ASF.FOLDER_CLASS)) {
        const strays = ASF.pruneStrayNativeWorkflows?.(nav) || 0;
        if (strays > 0) {
          ASF.log?.("pruned stray native rows", { strays });
        }
        if (!ASF.hasStrayNativeWorkflows?.(nav)) {
          ASF.log?.("rebuild skipped (unchanged)", {
            items: items.length,
            ms: Math.round(performance.now() - t0),
          });
          ASF.applySelection?.(nav);
          markReady(nav);
          ASF.updateDebug?.({
            itemCount: items.length,
            nestableCount: nestable.length,
            disabledCount: disabledFolderItems.length,
            folderNames: ASF.summarizeTree?.(tree) || [],
            showMorePresent: ASF.detectShowMore?.(nav) ?? null,
            lastRebuildAt: new Date().toISOString(),
            lastReason: reason + ":skip",
          });
          return;
        }
        // Strays remained — fall through to full paint.
      }

      const painted = paint(nav, items, settings);
      if (painted.ok) lastKey = key;

      const showMorePresent = ASF.detectShowMore?.(nav) ?? false;
      ASF.updateDebug?.({
        itemCount: items.length,
        nestableCount: nestable.length,
        disabledCount: disabledFolderItems.length,
        folderNames: ASF.summarizeTree?.(tree) || [],
        showMorePresent,
        lastRebuildAt: new Date().toISOString(),
        lastReason: reason,
        lastError: null,
      });

      ASF.log?.("rebuild done", {
        reason,
        ok: painted.ok,
        items: items.length,
        nestable: nestable.length,
        disabled: disabledFolderItems.length,
        folders: ASF.summarizeTree?.(tree),
        showMorePresent,
        ms: Math.round(performance.now() - t0),
      });

      if (showMorePresent) {
        ASF.warn?.("Show more still present after render");
      }
    } finally {
      rebuilding = false;
    }
  }

  function publishApi() {
    ASF.publishDebug?.();
    if (globalThis.__ASF_DEBUG__) {
      globalThis.__ASF_DEBUG__.rebuild = (reason = "manual") => {
        lastKey = "";
        return rebuild(reason);
      };
    }
  }

  function observe() {
    const observer = new MutationObserver((mutations) => {
      if (rebuilding) return;
      let sawWorkflowDom = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.(ASF.SELECTORS.nav) ||
            node.querySelector?.(ASF.SELECTORS.nav) ||
            node.matches?.(ASF.SELECTORS.workflowItem) ||
            node.querySelector?.(ASF.SELECTORS.workflowItem) ||
            node.matches?.("[data-target='nav-list-group.showMoreItem']")
          ) {
            sawWorkflowDom = true;
            break;
          }
        }
        if (sawWorkflowDom) break;
      }
      if (!sawWorkflowDom) return;

      const nav = document.querySelector(ASF.SELECTORS.nav);
      // Sync: hide via CSS is instant; also delete unmarked nodes so selection
      // / counts stay correct.
      const strays = ASF.pruneStrayNativeWorkflows?.(nav) || 0;
      if (strays > 0) {
        ASF.log?.("live-pruned stray native rows", { strays });
        ASF.applySelection?.(nav);
      }

      // If our tree was wiped, rebuild; if only strays were added, pruning is enough.
      if (!nav?.querySelector("." + ASF.FOLDER_CLASS)) {
        markPending(nav);
        scheduleRebuild("mutation");
      } else if (ASF.hasStrayNativeWorkflows?.(nav)) {
        markPending(nav);
        scheduleRebuild("mutation");
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function listenSpa() {
    const onNav = (reason) => {
      lastKey = "";
      markPending();
      scheduleRebuild(reason);
    };
    document.addEventListener("turbo:load", () => onNav("turbo:load"));
    document.addEventListener("turbo:render", () => onNav("turbo:render"));
    document.addEventListener("turbo:before-render", () => {
      markPending();
    });
    window.addEventListener("popstate", () => onNav("popstate"));
  }

  function listenSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (
        !changes.disabledMode &&
        !changes.collapseFoldersByDefault &&
        !changes.debugMode
      ) {
        return;
      }
      if (changes.debugMode) {
        ASF.setDebugEnabled?.(Boolean(changes.debugMode.newValue));
        ASF.log?.("debugMode →", changes.debugMode.newValue);
      }
      lastKey = "";
      scheduleRebuild("settings");
      publishApi();
    });
  }

  // Hide as soon as a nav exists, even before first rebuild schedules.
  markPending();
  observe();
  listenSpa();
  listenSettings();
  publishApi();
  scheduleRebuild("init");
})();
