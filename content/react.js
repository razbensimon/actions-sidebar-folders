/**
 * GitHub's React Actions sidebar: collect + render.
 *
 * GitHub has shipped more than one React sidebar (Primer NavList with
 * ul > li rows, then a Sidebar component with div > div rows), so the DOM is
 * found structurally rather than by component names:
 *   - native list = lowest common ancestor of the workflow links
 *   - rows        = that list's children holding a workflow link
 *   - label       = deepest element in a plain row's link carrying its name
 *
 * React owns the native rows, so we never move them. The native list is
 * hidden via a CSS attribute and our own tree is painted right after it.
 * Hidden native links/pin toggles stay clickable, so leaf clicks still go
 * through React Router and pin toggles through GitHub's own handlers.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOT_MARK = "data-asf-rooted";
  const NATIVE_LIST_MARK = "data-asf-native-list";
  const LABEL_SLOT = "data-asf-label-slot";
  const WORKFLOW_LINK = 'a[href*="/actions/workflows/"]';
  const ROW_HINT = 'li, [data-component$="Item"]';
  const LEGACY_ROW = 'li[data-test-selector="workflow-rendered"]';
  const MAX_JSON_PAGES = 50;
  const SHOW_MORE_MAX_CLICKS = 20;
  const READY_TIMEOUT_MS = 10000;
  const DIFF_IGNORED_ATTRS = new Set([
    "class",
    "id",
    "style",
    "href",
    "tabindex",
    "aria-current",
    "aria-labelledby",
    "aria-describedby",
    "data-cursor-ref",
  ]);

  /** Last sanitized native row; survives repaints once natives are hidden. */
  let rowTemplate = null;
  /** How GitHub marks the current row, learned from its own markup. */
  let activeDiff = null;
  let activeDiffFromList = false;
  let expandingShowMore = false;
  /** Next paint keeps each folder's open/closed state (repaints we trigger). */
  let keepFolderState = false;

  function requestRepaint(reason) {
    keepFolderState = true;
    globalThis.ASF.requestRebuild?.(reason);
  }

  function currentNav() {
    const selector = globalThis.ASF?.SELECTORS?.nav;
    return selector ? document.querySelector(selector) : null;
  }

  // ---------------------------------------------------------------------------
  // Native DOM discovery

  function isReactNav(nav) {
    if (!nav || nav.nodeType !== 1) return false;
    if (nav.querySelector(LEGACY_ROW)) return false;
    return nav.hasAttribute("data-component") || Boolean(nav.querySelector("[data-component]"));
  }

  function nativeAnchors(nav) {
    return [...nav.querySelectorAll(WORKFLOW_LINK)].filter(
      (a) => !a.closest(`[${ROOT_MARK}]`)
    );
  }

  function commonAncestor(nodes) {
    let anc = nodes[0]?.parentElement || null;
    while (anc && !nodes.every((n) => anc.contains(n))) anc = anc.parentElement;
    return anc;
  }

  function findNativeList(nav) {
    if (!nav) return null;
    const anchors = nativeAnchors(nav);
    const marked = nav.querySelector(`[${NATIVE_LIST_MARK}]`);
    if (marked && anchors.every((a) => marked.contains(a))) return marked;
    if (anchors.length === 0) return null;

    // The parent holding most row-shaped workflow links; a stray link elsewhere
    // (e.g. a "current workflow" item) must not widen the list to the nav.
    const counts = new Map();
    for (const a of anchors) {
      const parent = a.closest(ROW_HINT)?.parentElement;
      if (parent && nav.contains(parent)) counts.set(parent, (counts.get(parent) || 0) + 1);
    }
    let best = null;
    for (const [parent, count] of counts) {
      if (!best || count > counts.get(best)) best = parent;
    }
    if (best && (counts.get(best) >= 2 || anchors.length === 1)) return best;
    return anchors.length >= 2 ? commonAncestor(anchors) : null;
  }

  function rowOf(list, el) {
    let row = el;
    while (row && row.parentElement !== list) row = row.parentElement;
    return row || null;
  }

  function rowAnchor(row) {
    if (!row) return null;
    return row.matches(WORKFLOW_LINK) ? row : row.querySelector(WORKFLOW_LINK);
  }

  function rowHref(row) {
    return rowAnchor(row)?.getAttribute("href") || "";
  }

  function nativeRows(list) {
    if (!list) return [];
    return [...list.children].filter((child) => rowAnchor(child));
  }

  function findReactRoot(nav) {
    return nav?.querySelector(`[${ROOT_MARK}]`) || null;
  }

  function isReactPainted(nav) {
    return Boolean(findReactRoot(nav));
  }

  /** Text-bearing elements that hold exactly `text` (deepest last). */
  function elementsWithText(scope, text) {
    if (!text) return [];
    return [...scope.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && (el.textContent || "").trim() === text
    );
  }

  function findDisabledMarker(row) {
    return elementsWithText(row, "Disabled")[0] || null;
  }

  /**
   * GitHub's per-row pin toggle: a button outside the link, only rendered when
   * the viewer may pin and the workflow is active. Shows PinIcon when unpinned
   * and PinSlashIcon when pinned.
   */
  function findPinButton(row) {
    if (!row) return null;
    return (
      [...row.querySelectorAll("button")].find(
        (b) =>
          !b.closest("a") && b.querySelector(".octicon-pin, .octicon-pin-slash")
      ) || null
    );
  }

  /** Top-level child of the row that holds the pin button (the trailing action). */
  function pinActionOf(row, button) {
    let el = button;
    while (el && el.parentElement !== row) el = el.parentElement;
    return el || button;
  }

  function parseReactRow(row) {
    const href = rowHref(row);
    if (!href) return null;
    const pinButton = findPinButton(row);
    return {
      href,
      disabled: Boolean(findDisabledMarker(row)),
      pinnable: Boolean(pinButton),
      pinned: Boolean(pinButton?.querySelector(".octicon-pin-slash")),
    };
  }

  /** Keep our tree's native counterpart hidden (React may swap the list node). */
  function syncReactNative(nav) {
    if (!isReactPainted(nav)) return;
    const list = findNativeList(nav);
    if (!list || list.hasAttribute(NATIVE_LIST_MARK)) return;
    nav
      .querySelectorAll(`[${NATIVE_LIST_MARK}]`)
      .forEach((el) => el.removeAttribute(NATIVE_LIST_MARK));
    list.setAttribute(NATIVE_LIST_MARK, "1");
  }

  // ---------------------------------------------------------------------------
  // Data

  /**
   * Sidebar href for a workflow `path` from the JSON API:
   * ".github/workflows/ci.yml" → ".../actions/workflows/ci.yml"
   * "dynamic/dependabot/dependabot-updates" → ".../actions/workflows/dependabot/dependabot-updates"
   */
  function workflowHrefFromPath(repo, path) {
    const p = String(path || "");
    const slug = p.startsWith("dynamic/") ? p.slice("dynamic/".length) : p.split("/").pop();
    if (!repo || !slug) return "";
    return `/${repo.owner}/${repo.repo}/actions/workflows/${slug}`;
  }

  function findWorkflowsRoute(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (Array.isArray(payload.workflowsSidebarRoute?.workflows)) {
      return payload.workflowsSidebarRoute;
    }
    return (
      Object.values(payload).find(
        (v) => v && typeof v === "object" && Array.isArray(v.workflows)
      ) || null
    );
  }

  /** Parse one `/actions/_workflows` JSON page into WorkflowItems. */
  function parseWorkflowsResponse(json, repo) {
    const route = findWorkflowsRoute(json?.payload);
    const workflows = Array.isArray(route?.workflows) ? route.workflows : [];
    const items = workflows
      .filter((w) => w && w.name && w.path)
      .map((w) => ({
        id: String(w.id ?? w.path),
        name: String(w.name),
        href: workflowHrefFromPath(repo, w.path),
        disabled: Boolean(w.state) && w.state !== "active",
        pinned: false,
      }));
    return { items, totalCount: Number(route?.totalCount) || 0 };
  }

  /** Every `pinnedWorkflowIds` array in a React embedded-data payload. */
  function pinnedIdsFromPayload(payload) {
    const ids = new Set();
    const visit = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 3) return;
      if (Array.isArray(node.pinnedWorkflowIds)) {
        node.pinnedWorkflowIds.forEach((id) => ids.add(String(id)));
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          visit(value, depth + 1);
        }
      }
    };
    visit(payload, 0);
    return ids;
  }

  function readEmbeddedPinnedIds(doc = document) {
    const ids = new Set();
    doc
      .querySelectorAll('script[data-target="react-app.embeddedData"]')
      .forEach((script) => {
        try {
          const data = JSON.parse(script.textContent || "");
          pinnedIdsFromPayload(data?.payload).forEach((id) => ids.add(id));
        } catch {
          /* not JSON */
        }
      });
    return ids;
  }

  async function fetchWorkflowsPage(repo, page) {
    const url = `/${repo.owner}/${repo.repo}/actions/_workflows?page=${page}&sort=default`;
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "GitHub-Verified-Fetch": "true",
      },
    });
    if (!res.ok) throw new Error(`_workflows page ${page} failed: ${res.status}`);
    return parseWorkflowsResponse(await res.json(), repo);
  }

  async function fetchAllWorkflows(repo) {
    const first = await fetchWorkflowsPage(repo, 1);
    const items = first.items.slice();
    const pageSize = first.items.length;
    if (pageSize > 0 && first.totalCount > pageSize) {
      const pages = Math.min(MAX_JSON_PAGES, Math.ceil(first.totalCount / pageSize));
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) => fetchWorkflowsPage(repo, i + 2))
      );
      for (const page of rest) items.push(...page.items);
    }
    return items;
  }

  /**
   * Full workflow list for the React sidebar. Returns [] when nothing
   * trustworthy could be fetched, so the caller fails open to GitHub's list.
   */
  async function collectReactWorkflowItems(nav) {
    const ASF = globalThis.ASF;
    const repo = ASF.parseRepoFromLocation?.();
    if (!repo) return [];

    const native = nativeRows(findNativeList(nav)).map(parseReactRow).filter(Boolean);

    let fetched = [];
    let source = "json";
    try {
      fetched = await fetchAllWorkflows(repo);
    } catch (err) {
      ASF.warn?.("_workflows JSON failed, trying workflows_partial", err);
    }
    if (!fetched.length) {
      source = "partial";
      try {
        fetched = await ASF.collectWorkflowItems(nav);
      } catch (err) {
        ASF.warn?.("workflows_partial failed", err);
      }
    }
    if (!fetched.length) return [];

    const pinnedIds = readEmbeddedPinnedIds();
    const nativeByHref = new Map(native.map((n) => [n.href, n]));
    const items = ASF.dedupeByHref(fetched).map((item) => {
      const { element, ...rest } = item;
      const seen = nativeByHref.get(rest.href);
      // Embedded pinned ids go stale after a pin toggle; a live pin button doesn't.
      rest.pinned = seen?.pinnable
        ? seen.pinned
        : Boolean(rest.pinned || pinnedIds.has(String(rest.id)));
      rest.disabled = Boolean(rest.disabled || seen?.disabled);
      return rest;
    });
    ASF.log?.("react collect done", {
      source,
      fetched: fetched.length,
      native: native.length,
      pinned: items.filter((i) => i.pinned).length,
    });
    return items;
  }

  function reactAppReady(nav) {
    if (document.readyState !== "complete") return false;
    const app = nav?.closest?.("react-app");
    return !app || app.classList.contains("loaded");
  }

  /** Resolve once React has hydrated the SSR sidebar, so we don't fight it. */
  function whenReactReady(nav) {
    const start = performance.now();
    return new Promise((resolve) => {
      const settle = () => {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => resolve(), { timeout: 300 });
        } else {
          setTimeout(resolve, 0);
        }
      };
      const tick = () => {
        if (reactAppReady(currentNav() || nav) || performance.now() - start > READY_TIMEOUT_MS) {
          settle();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  // ---------------------------------------------------------------------------
  // Templates copied from native markup

  function stripIdentity(root) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      for (const name of DIFF_IGNORED_ATTRS) {
        if (name !== "class" && name !== "style" && name !== "href") {
          el.removeAttribute(name);
        }
      }
    }
  }

  function sanitizeTemplate(row) {
    const anchor = rowAnchor(row);
    const name = (anchor?.textContent || "").trim();
    const label = elementsWithText(anchor, name).pop();
    if (!anchor || !label) return null;

    label.setAttribute(LABEL_SLOT, "1");
    const copy = row.cloneNode(true);
    label.removeAttribute(LABEL_SLOT);

    const copyAnchor = rowAnchor(copy);
    // Keep only the link (drops tooltips and hover pin/menu trailing actions).
    if (copy !== copyAnchor) {
      [...copy.children].forEach((child) => {
        if (!child.contains(copyAnchor)) child.remove();
      });
    }
    copy.querySelectorAll("[popover], [role='tooltip']").forEach((el) => el.remove());
    stripIdentity(copy);
    return copy.querySelector(`[${LABEL_SLOT}]`) ? copy : null;
  }

  function captureTemplate(rows) {
    const plain =
      rows.find((r) => !r.querySelector("button, svg") && !rowAnchor(r).hasAttribute("aria-current")) ||
      rows.find((r) => !rowAnchor(r).hasAttribute("aria-current")) ||
      rows[0];
    const template = plain ? sanitizeTemplate(plain) : null;
    if (template) rowTemplate = template;
    return rowTemplate;
  }

  function fallbackRow() {
    const row = document.createElement("li");
    row.className = "asf-react-fallback-item";
    const a = document.createElement("a");
    a.className = "asf-react-fallback-link";
    const label = document.createElement("span");
    label.setAttribute(LABEL_SLOT, "1");
    a.appendChild(label);
    row.appendChild(a);
    return row;
  }

  /** Shell + content of GitHub's trailing "Disabled" visual, if one is on screen. */
  function captureTrailing(rows) {
    for (const row of rows) {
      const marker = findDisabledMarker(row);
      const anchor = rowAnchor(row);
      if (!marker || !anchor?.contains(marker)) continue;
      const name = (anchor.textContent || "").replace(/Disabled\s*$/, "").trim();
      const label = elementsWithText(anchor, name).pop();
      if (!label) continue;
      // The trailing visual is the marker's ancestor sitting next to the label.
      let shell = marker;
      while (shell && shell.parentElement !== label.parentElement) shell = shell.parentElement;
      if (!shell || shell === label) continue;
      const content = shell.cloneNode(true);
      stripIdentity(content);
      return { shell: shell.cloneNode(false), disabledContent: [...content.childNodes] };
    }
    return null;
  }

  function makeTrailing(ctx, { disabled, pinned }) {
    const shell = ctx.trailing ? ctx.trailing.shell.cloneNode(false) : document.createElement("span");
    if (!ctx.trailing) shell.className = "asf-react-trailing";
    stripIdentity(shell);
    if (disabled) {
      if (ctx.trailing) {
        ctx.trailing.disabledContent.forEach((node) => shell.appendChild(node.cloneNode(true)));
      } else {
        const text = document.createElement("span");
        text.className = "color-fg-muted text-small";
        text.textContent = "Disabled";
        shell.appendChild(text);
      }
    }
    if (pinned) shell.insertAdjacentHTML("beforeend", globalThis.ASF.PIN_SVG);
    return shell;
  }

  /** Class names from the native markup so our rows match GitHub's styling. */
  function reactClasses(list, template) {
    const anchor = template ? rowAnchor(template) : null;
    return {
      folderHeader: template?.className || "asf-react-fallback-item",
      folderButton: anchor?.className || "asf-react-fallback-link",
      label: template?.querySelector(`[${LABEL_SLOT}]`)?.className || "",
      nestList: list?.className || "",
      buttonAttrs: anchor?.getAttribute("data-size")
        ? { "data-size": anchor.getAttribute("data-size") }
        : {},
    };
  }

  // ---------------------------------------------------------------------------
  // Active (current workflow) styling

  function elementDiff(active, plain, withRemovals) {
    const a = new Set(active.classList);
    const p = new Set(plain.classList);
    const attrs = {};
    for (const { name, value } of active.attributes) {
      if (DIFF_IGNORED_ATTRS.has(name) || name.startsWith("data-asf")) continue;
      if (plain.getAttribute(name) !== value) attrs[name] = value;
    }
    return {
      add: [...a].filter((c) => !p.has(c)),
      remove: withRemovals ? [...p].filter((c) => !a.has(c)) : [],
      attrs,
    };
  }

  function rowDiff(activeRow, plainRow, withRemovals) {
    const activeLink = rowAnchor(activeRow) || activeRow.querySelector("a");
    const plainLink = rowAnchor(plainRow);
    return {
      row: activeRow !== activeLink ? elementDiff(activeRow, plainRow, withRemovals) : null,
      link: activeLink && plainLink ? elementDiff(activeLink, plainLink, withRemovals) : null,
    };
  }

  /**
   * Prefer an active row from the workflow list itself (exact diff); fall back
   * to another current row in the sidebar (e.g. "All workflows"), additions only.
   */
  function learnActiveDiff(nav, rows) {
    const isCurrent = (row) => rowAnchor(row)?.getAttribute("aria-current") === "page";
    const candidates = rows.filter((r) => !isCurrent(r) && !findDisabledMarker(r));
    const plain = candidates.find((r) => !findPinButton(r)) || candidates[0];
    if (!plain) return;
    const active = rows.find(isCurrent);
    if (active) {
      activeDiff = rowDiff(active, plain, true);
      activeDiffFromList = true;
      return;
    }
    if (activeDiffFromList) return;
    const other = [...nav.querySelectorAll('a[aria-current="page"]')]
      .filter((a) => !a.closest(`[${ROOT_MARK}]`))
      .map((a) => a.closest(ROW_HINT) || a)[0];
    if (other) activeDiff = rowDiff(other, plain, false);
  }

  function applyDiff(el, diff, on) {
    if (!el || !diff) return;
    for (const c of diff.add) el.classList.toggle(c, on);
    for (const c of diff.remove) el.classList.toggle(c, !on);
    for (const [name, value] of Object.entries(diff.attrs)) {
      if (on) el.setAttribute(name, value);
      else el.removeAttribute(name);
    }
  }

  /** Diff each leaf was activated with, so deactivation undoes exactly that. */
  const appliedDiffs = new WeakMap();

  function setLeafActive(leaf, on) {
    const anchor = leaf.querySelector("a[href]");
    const diff = on ? activeDiff : appliedDiffs.get(leaf);
    if (on && diff) appliedDiffs.set(leaf, diff);
    if (!on) appliedDiffs.delete(leaf);
    if (diff) {
      applyDiff(leaf, diff.row, on);
      applyDiff(anchor, diff.link, on);
    } else if (on) {
      leaf.setAttribute("data-active", "true");
    } else {
      leaf.removeAttribute("data-active");
    }
    if (on) anchor?.setAttribute("aria-current", "page");
    else anchor?.removeAttribute("aria-current");
    leaf.toggleAttribute("data-asf-active", on);
  }

  function revealLeaf(leaf) {
    const setFolderOpen = globalThis.ASF.setFolderOpen;
    let folder = leaf.parentElement?.closest(".asf-folder-group");
    while (folder) {
      setFolderOpen(folder, true);
      folder = folder.parentElement?.closest(".asf-folder-group");
    }
  }

  function applyReactSelection(nav) {
    const root = findReactRoot(nav);
    if (!root) return;
    learnActiveDiff(nav, nativeRows(findNativeList(nav)));
    const isActivePath = globalThis.ASF.isActivePath;
    root.querySelectorAll("[data-asf-leaf]").forEach((leaf) => {
      const active = isActivePath(leaf.querySelector("a[href]")?.getAttribute("href"));
      if (active === leaf.hasAttribute("data-asf-active")) return;
      setLeafActive(leaf, active);
      if (active) revealLeaf(leaf);
    });
  }

  // ---------------------------------------------------------------------------
  // Leaves, clicks, pin toggles

  /** Inert copy of GitHub's pin toggle; clicks are forwarded to the native one. */
  function clonePinAction(row, button, item) {
    const copy = pinActionOf(row, button).cloneNode(true);
    copy.querySelectorAll("[popover], [role='tooltip']").forEach((el) => el.remove());
    stripIdentity(copy);
    const toggle = copy.matches("button") ? copy : copy.querySelector("button");
    if (!toggle) return null;
    const label = `${item.pinned ? "Unpin" : "Pin"} ${item.name}`;
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
    toggle.setAttribute("data-asf-pin-toggle", "1");
    return copy;
  }

  function makeReactLeaf(leaf, ctx) {
    const item = leaf.item;
    const nativeRow = ctx.nativeByHref.get(item.href);
    const nativePin = findPinButton(nativeRow);
    const pinAction = nativePin ? clonePinAction(nativeRow, nativePin, item) : null;

    const row = ctx.template ? ctx.template.cloneNode(true) : fallbackRow();
    const anchor = rowAnchor(row) || row.querySelector("a");
    anchor.setAttribute("href", item.href || "#");

    const label = row.querySelector(`[${LABEL_SLOT}]`);
    label.removeAttribute(LABEL_SLOT);
    label.textContent = leaf.name;
    label.classList.add(globalThis.ASF.LABEL_CLASS);

    row.setAttribute("data-asf-leaf", "1");
    if (item.id) row.setAttribute("data-item-id", String(item.id));
    if (item.name) row.setAttribute("data-asf-full-name", item.name);
    if (item.disabled) row.setAttribute("data-asf-disabled", "1");
    if (item.pinned) row.setAttribute("data-asf-pinned", "1");

    // GitHub's own toggle already shows pin state; only draw ours without it.
    const pinned = item.pinned && !pinAction;
    if (item.disabled || pinned) {
      label.after(makeTrailing(ctx, { disabled: item.disabled, pinned }));
    }
    if (pinAction) row.appendChild(pinAction);
    return row;
  }

  function nativeRowByHref(nav, href) {
    if (!href) return null;
    return nativeRows(findNativeList(nav)).find((row) => rowHref(row) === href) || null;
  }

  function nativePinState(nav, href) {
    const button = findPinButton(nativeRowByHref(nav, href));
    if (!button) return null;
    return Boolean(button.querySelector(".octicon-pin-slash"));
  }

  /**
   * Forward a pin toggle to GitHub's hidden native button (React does the API
   * call and refreshes its list), then repaint once its state has flipped.
   */
  async function togglePin(toggle) {
    if (toggle.disabled) return;
    const href = toggle
      .closest("[data-asf-leaf]")
      ?.querySelector("a[href]")
      ?.getAttribute("href");
    const nativeButton = findPinButton(nativeRowByHref(currentNav(), href));
    if (!nativeButton) return;
    const wasPinned = nativePinState(currentNav(), href);
    toggle.disabled = true;
    toggle.setAttribute("aria-busy", "true");
    nativeButton.click();
    const flipped = await waitFor(() => {
      const state = nativePinState(currentNav(), href);
      return state !== null && state !== wasPinned;
    }, 10000);
    if (!flipped) globalThis.ASF.warn?.("pin toggle not confirmed", href);
    // GitHub may have reset its list to page 1; repaint either way.
    requestRepaint("pin");
  }

  /** Route leaf clicks through the hidden native link so React Router navigates. */
  function onRootClick(event) {
    const root = event.currentTarget;
    const toggle = event.target.closest?.("[data-asf-pin-toggle]");
    if (toggle && root.contains(toggle)) {
      event.preventDefault();
      event.stopPropagation();
      togglePin(toggle).catch((err) => globalThis.ASF.warn?.("pin toggle failed", err));
      return;
    }
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || !root.contains(anchor)) return;
    const native = rowAnchor(nativeRowByHref(currentNav(), anchor.getAttribute("href")));
    if (!native) return;
    event.preventDefault();
    native.click();
  }

  function findShowMoreButton(list) {
    if (!list) return null;
    return (
      [...list.querySelectorAll("button")].find((b) =>
        /^\s*Show more\s*$/i.test(b.textContent || "")
      ) || null
    );
  }

  function waitFor(predicate, timeoutMs) {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (predicate()) return resolve(true);
        if (performance.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  /**
   * Load every native page in the background so each of our leaves has a
   * hidden native link (client-side navigation) and pin toggle to forward to.
   */
  async function expandNativeShowMore() {
    if (expandingShowMore) return;
    expandingShowMore = true;
    const list = () => findNativeList(currentNav());
    const initialRows = nativeRows(list()).length;
    try {
      for (let i = 0; i < SHOW_MORE_MAX_CLICKS; i++) {
        const button = findShowMoreButton(list());
        if (!button) return;
        const before = nativeRows(list()).length;
        button.click();
        const progressed = await waitFor(
          () => nativeRows(list()).length > before || !findShowMoreButton(list()),
          5000
        );
        if (!progressed) return;
      }
    } finally {
      expandingShowMore = false;
      // Newly loaded rows carry pin toggles our leaves don't have yet.
      if (nativeRows(list()).length > initialRows) requestRepaint("show-more");
    }
  }

  // ---------------------------------------------------------------------------
  // Folder state across repaints we trigger

  function folderKey(group) {
    const names = [];
    for (let g = group; g; g = g.parentElement?.closest(".asf-folder-group")) {
      names.unshift(g.getAttribute("data-asf-folder"));
    }
    return names.join("\u0000");
  }

  function readFolderStates(listEl) {
    const states = new Map();
    listEl.querySelectorAll(".asf-folder-group").forEach((g) => {
      // While searching, folders are force-opened; keep the pre-search state.
      const prev = g.getAttribute("data-asf-prev-open");
      states.set(
        folderKey(g),
        prev !== null ? prev === "1" : g.classList.contains("asf-folder-group--open")
      );
    });
    return states;
  }

  function restoreFolderStates(listEl, states) {
    const setFolderOpen = globalThis.ASF.setFolderOpen;
    listEl.querySelectorAll(".asf-folder-group").forEach((g) => {
      const key = folderKey(g);
      if (states.has(key)) setFolderOpen(g, states.get(key));
    });
  }

  // ---------------------------------------------------------------------------
  // Paint

  function ensureRoot(nav, list) {
    let root = findReactRoot(nav);
    if (root && root.parentElement !== list.parentElement) {
      root.remove();
      root = null;
    }
    if (!root) {
      root = document.createElement(list.tagName === "UL" || list.tagName === "OL" ? "ul" : "div");
      root.setAttribute(ROOT_MARK, "1");
      root.addEventListener("click", onRootClick);
      list.after(root);
    }
    root.className = list.className;
    const labelledBy = list.getAttribute("aria-labelledby");
    if (labelledBy) root.setAttribute("aria-labelledby", labelledBy);
    return root;
  }

  function renderReactTree(
    nav,
    tree,
    settings,
    disabledFolderItems = [],
    pinnedItems = []
  ) {
    const ASF = globalThis.ASF;
    const list = findNativeList(nav);
    if (!list?.parentElement) return false;

    const rows = nativeRows(list);
    const template = captureTemplate(rows);
    const ctx = {
      template,
      nativeByHref: new Map(rows.map((row) => [rowHref(row), row])),
      trailing: captureTrailing(rows),
    };
    const makeLeaf = (leaf) => makeReactLeaf(leaf, ctx);
    const opts = { classes: reactClasses(list, template), makeLeaf };

    const listEl = ensureRoot(nav, list);
    const folderStates = keepFolderState ? readFolderStates(listEl) : null;
    keepFolderState = false;
    listEl.replaceChildren();

    if (settings.showPinnedAtTop !== false) {
      for (const item of pinnedItems) {
        const copy = makeLeaf({ type: "leaf", name: item.name, item });
        copy.setAttribute("data-asf-pinned-copy", "1");
        listEl.appendChild(copy);
      }
    }

    for (const node of ASF.orderTopLevel(tree, disabledFolderItems)) {
      listEl.appendChild(
        node.type === "folder"
          ? ASF.createFolderElement(node, ASF.folderSettings(node, settings), opts)
          : makeLeaf(node)
      );
    }

    if (folderStates) restoreFolderStates(listEl, folderStates);
    nav
      .querySelectorAll(`[${NATIVE_LIST_MARK}]`)
      .forEach((el) => el !== list && el.removeAttribute(NATIVE_LIST_MARK));
    list.setAttribute(NATIVE_LIST_MARK, "1");
    applyReactSelection(nav);
    ASF.ensureSearchBox?.(nav, listEl);
    ASF.applySearchFilter?.(nav);
    expandNativeShowMore().catch(() => {});
    return true;
  }

  return {
    isReactNav,
    isReactPainted,
    findNativeList,
    parseReactRow,
    syncReactNative,
    workflowHrefFromPath,
    parseWorkflowsResponse,
    pinnedIdsFromPayload,
    collectReactWorkflowItems,
    whenReactReady,
    renderReactTree,
    applyReactSelection,
  };
});
