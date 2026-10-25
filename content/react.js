/**
 * GitHub's React Actions sidebar (Primer React NavList): collect + render.
 *
 * React owns the native workflow rows, so we never move them. Instead the
 * native list is hidden via CSS and our own tree is painted next to it, inside
 * the same "Workflows" group. Hidden native anchors stay clickable so leaf
 * clicks can still go through React Router.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOT_MARK = "data-asf-rooted";
  const GROUP_MARK = "data-asf-react-group";
  const NATIVE_GROUP = 'li[data-component="ActionList.Group"]';
  const NATIVE_ITEM = 'li[data-component="ActionList.Item"]';
  const NATIVE_LABEL = '[data-component="ActionList.Item.Label"]';
  const NATIVE_SUBCONTENT = '[data-component="ActionList.Item--DividerContainer"]';
  const NATIVE_TRAILING = '[data-component="ActionList.TrailingVisual"]';
  const MAX_JSON_PAGES = 50;
  const SHOW_MORE_MAX_CLICKS = 20;
  const READY_TIMEOUT_MS = 10000;

  /** Last sanitized native row; survives repaints once natives are hidden. */
  let rowTemplate = null;
  let expandingShowMore = false;
  /** Next paint keeps each folder's open/closed state (repaints we trigger). */
  let keepFolderState = false;

  function requestRepaint(reason) {
    keepFolderState = true;
    globalThis.ASF.requestRebuild?.(reason);
  }

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

  function isReactNav(nav) {
    if (!nav || nav.nodeType !== 1) return false;
    return (
      nav.getAttribute("data-component") === "NavList" ||
      Boolean(nav.querySelector(`${NATIVE_GROUP}, ${NATIVE_ITEM}`))
    );
  }

  function groupHeadingText(group) {
    return (
      group.querySelector('[data-component="ActionList.GroupHeading"], h3')
        ?.textContent || ""
    ).trim();
  }

  function findReactWorkflowGroup(nav) {
    if (!nav) return null;
    const groups = [...nav.querySelectorAll(NATIVE_GROUP)];
    return (
      groups.find((g) => g.hasAttribute(GROUP_MARK)) ||
      groups.find((g) => /^Workflows$/i.test(groupHeadingText(g))) ||
      groups.find((g) => g.querySelector('a[href*="/actions/workflows/"]')) ||
      null
    );
  }

  function nativeListOf(group) {
    return group?.querySelector(`:scope > ul:not([${ROOT_MARK}])`) || null;
  }

  function reactRootOf(group) {
    return group?.querySelector(`:scope > ul[${ROOT_MARK}]`) || null;
  }

  function findReactRoot(nav) {
    return reactRootOf(findReactWorkflowGroup(nav));
  }

  function nativeRows(group) {
    const list = nativeListOf(group);
    if (!list) return [];
    return [...list.querySelectorAll(`:scope > ${NATIVE_ITEM}`)].filter(
      (li) => li.querySelector('a[href*="/actions/workflows/"]')
    );
  }

  function isReactPainted(nav) {
    return Boolean(findReactRoot(nav));
  }

  /**
   * GitHub's per-row pin toggle (ActionList.TrailingAction, outside the link).
   * Only rendered when the viewer may pin and the workflow is active. Shows
   * PinIcon when unpinned and PinSlashIcon when pinned.
   */
  function findPinButton(li) {
    if (!li) return null;
    return (
      [...li.querySelectorAll("button")].find(
        (b) =>
          !b.closest("a") && b.querySelector(".octicon-pin, .octicon-pin-slash")
      ) || null
    );
  }

  /** Top-level child of the row that holds the pin button (the trailing action). */
  function pinActionOf(li, button) {
    let el = button;
    while (el && el.parentElement !== li) el = el.parentElement;
    return el || button;
  }

  function parseReactRow(li) {
    const anchor = li.querySelector("a[href]");
    const name = (li.querySelector(NATIVE_LABEL)?.textContent || "").trim();
    if (!anchor || !name) return null;
    const href = anchor.getAttribute("href") || "";
    const trailing = li.querySelector(NATIVE_TRAILING);
    const disabled = /^\s*Disabled\s*$/i.test(
      trailing?.querySelector(".color-fg-muted")?.textContent ||
        trailing?.textContent ||
        ""
    );
    const pinButton = findPinButton(li);
    return {
      id: href,
      name,
      href,
      disabled,
      pinnable: Boolean(pinButton),
      pinned: Boolean(pinButton?.querySelector(".octicon-pin-slash")),
    };
  }

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

    const group = findReactWorkflowGroup(nav);
    const native = group ? nativeRows(group).map(parseReactRow).filter(Boolean) : [];

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
    const selector = globalThis.ASF?.SELECTORS?.nav;
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
        const current = (selector && document.querySelector(selector)) || nav;
        if (reactAppReady(current) || performance.now() - start > READY_TIMEOUT_MS) {
          settle();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function sanitizeTemplate(li) {
    const copy = li.cloneNode(true);
    const anchor = copy.querySelector("a");
    if (!anchor) return null;
    // Keep only the link (drops hover pin/menu trailing actions).
    [...copy.children].forEach((child) => {
      if (child !== anchor) child.remove();
    });
    anchor
      .querySelectorAll(
        `${NATIVE_TRAILING}, [data-component="ActionList.LeadingVisual"], [data-component="ActionList.Description"]`
      )
      .forEach((el) => el.remove());
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      el.removeAttribute("id");
      el.removeAttribute("aria-labelledby");
      el.removeAttribute("aria-describedby");
      el.removeAttribute("aria-current");
      el.removeAttribute("data-active");
      el.removeAttribute("data-cursor-ref");
    }
    if (!copy.querySelector(NATIVE_LABEL)) return null;
    return copy;
  }

  function captureTemplate(group) {
    const rows = nativeRows(group);
    const plain =
      rows.find((li) => !li.querySelector(NATIVE_TRAILING)) || rows[0];
    const template = plain ? sanitizeTemplate(plain) : null;
    if (template) rowTemplate = template;
    return rowTemplate;
  }

  function fallbackRow() {
    const li = document.createElement("li");
    li.className = "asf-react-fallback-item";
    const a = document.createElement("a");
    a.className = "asf-react-fallback-link";
    const label = document.createElement("span");
    label.setAttribute("data-component", "ActionList.Item.Label");
    a.appendChild(label);
    li.appendChild(a);
    return li;
  }

  /** Class names from the native markup so our rows match Primer React styling. */
  function reactClasses(group, template) {
    const anchor = template?.querySelector("a");
    return {
      folderHeader: template?.className || "asf-react-fallback-item",
      folderButton: anchor?.className || "asf-react-fallback-link",
      label: template?.querySelector(NATIVE_LABEL)?.className || "",
      nestList: nativeListOf(group)?.className || "",
      buttonAttrs: anchor?.getAttribute("data-size")
        ? { "data-size": anchor.getAttribute("data-size") }
        : {},
    };
  }

  function trailingClassName(nav) {
    return (
      nav.querySelector(NATIVE_TRAILING)?.className || "asf-react-trailing"
    );
  }

  /** Inert copy of GitHub's pin toggle; clicks are forwarded to the native one. */
  function clonePinAction(row, button, item) {
    const copy = pinActionOf(row, button).cloneNode(true);
    copy
      .querySelectorAll("[popover], [role='tooltip']")
      .forEach((el) => el.remove());
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      el.removeAttribute("id");
      el.removeAttribute("aria-labelledby");
      el.removeAttribute("aria-describedby");
      el.removeAttribute("data-cursor-ref");
    }
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
    const nativePin = nativeRow ? findPinButton(nativeRow) : null;
    const pinAction = nativePin ? clonePinAction(nativeRow, nativePin, item) : null;
    const li = ctx.template ? ctx.template.cloneNode(true) : fallbackRow();
    const anchor = li.querySelector("a");
    anchor.setAttribute("href", item.href || "#");

    const label = li.querySelector(NATIVE_LABEL);
    label.textContent = leaf.name;
    label.classList.add(globalThis.ASF.LABEL_CLASS);

    li.setAttribute("data-asf-leaf", "1");
    if (item.id) li.setAttribute("data-item-id", String(item.id));
    if (item.name) li.setAttribute("data-asf-full-name", item.name);
    if (item.disabled) li.setAttribute("data-asf-disabled", "1");
    if (item.pinned) li.setAttribute("data-asf-pinned", "1");

    // GitHub's own toggle already shows pin state; only draw ours without it.
    const showPinVisual = item.pinned && !pinAction;
    if (item.disabled || showPinVisual) {
      const trailing = document.createElement("span");
      trailing.className = ctx.trailingClass;
      trailing.setAttribute("data-component", "ActionList.TrailingVisual");
      if (item.disabled) {
        const text = document.createElement("span");
        text.className = "color-fg-muted text-small";
        text.textContent = "Disabled";
        trailing.appendChild(text);
      }
      if (showPinVisual) {
        trailing.insertAdjacentHTML("beforeend", globalThis.ASF.PIN_SVG);
      }
      (li.querySelector(NATIVE_SUBCONTENT) || anchor).appendChild(trailing);
    }
    if (pinAction) li.appendChild(pinAction);
    return li;
  }

  function nativeRowByHref(group, href) {
    if (!href) return null;
    return (
      nativeRows(group).find(
        (li) => li.querySelector("a[href]")?.getAttribute("href") === href
      ) || null
    );
  }

  function findNativeAnchor(group, href) {
    return nativeRowByHref(group, href)?.querySelector("a[href]") || null;
  }

  function nativePinState(group, href) {
    const button = findPinButton(nativeRowByHref(group, href));
    if (!button) return null;
    return Boolean(button.querySelector(".octicon-pin-slash"));
  }

  /**
   * Forward a pin toggle to GitHub's hidden native button (React does the API
   * call and refreshes its list), then repaint once its state has flipped.
   */
  async function togglePin(group, toggle) {
    if (toggle.disabled) return;
    const href = toggle
      .closest("[data-asf-leaf]")
      ?.querySelector("a[href]")
      ?.getAttribute("href");
    const nativeButton = findPinButton(nativeRowByHref(group, href));
    if (!nativeButton) return;
    const wasPinned = nativePinState(group, href);
    toggle.disabled = true;
    toggle.setAttribute("aria-busy", "true");
    nativeButton.click();
    const flipped = await waitFor(() => {
      const state = nativePinState(group, href);
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
      togglePin(root.parentElement, toggle).catch((err) =>
        globalThis.ASF.warn?.("pin toggle failed", err)
      );
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
    const native = findNativeAnchor(root.parentElement, anchor.getAttribute("href"));
    if (!native) return;
    event.preventDefault();
    native.click();
  }

  function findShowMoreButton(group) {
    const list = nativeListOf(group);
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
  async function expandNativeShowMore(group) {
    if (expandingShowMore) return;
    expandingShowMore = true;
    const initialRows = nativeRows(group).length;
    try {
      for (let i = 0; i < SHOW_MORE_MAX_CLICKS; i++) {
        const button = findShowMoreButton(group);
        if (!button || !group.isConnected) return;
        const before = nativeRows(group).length;
        button.click();
        const progressed = await waitFor(
          () =>
            !group.isConnected ||
            nativeRows(group).length > before ||
            !findShowMoreButton(group),
          5000
        );
        if (!progressed) return;
      }
    } finally {
      expandingShowMore = false;
      // Newly loaded rows carry pin toggles our leaves don't have yet.
      if (group.isConnected && nativeRows(group).length > initialRows) {
        requestRepaint("show-more");
      }
    }
  }

  function revealLeaf(li) {
    const setFolderOpen = globalThis.ASF.setFolderOpen;
    let folder = li.parentElement?.closest(".asf-folder-group");
    while (folder) {
      setFolderOpen(folder, true);
      folder = folder.parentElement?.closest(".asf-folder-group");
    }
  }

  function applyReactSelection(nav) {
    const root = findReactRoot(nav);
    if (!root) return;
    const isActivePath = globalThis.ASF.isActivePath;
    root.querySelectorAll("[data-asf-leaf]").forEach((li) => {
      const anchor = li.querySelector("a[href]");
      if (isActivePath(anchor?.getAttribute("href"))) {
        li.setAttribute("data-active", "true");
        anchor.setAttribute("aria-current", "page");
        revealLeaf(li);
      } else {
        li.removeAttribute("data-active");
        anchor?.removeAttribute("aria-current");
      }
    });
  }

  function renderReactTree(
    nav,
    tree,
    settings,
    disabledFolderItems = [],
    pinnedItems = []
  ) {
    const ASF = globalThis.ASF;
    const group = findReactWorkflowGroup(nav);
    const nativeList = nativeListOf(group);
    if (!group || !nativeList) return false;

    const template = captureTemplate(group);
    const nativeByHref = new Map(
      nativeRows(group).map((li) => [
        li.querySelector("a[href]")?.getAttribute("href"),
        li,
      ])
    );
    const ctx = { template, nativeByHref, trailingClass: trailingClassName(nav) };
    const makeLeaf = (leaf) => makeReactLeaf(leaf, ctx);
    const opts = { classes: reactClasses(group, template), makeLeaf };

    let listEl = reactRootOf(group);
    if (!listEl) {
      listEl = document.createElement("ul");
      listEl.setAttribute(ROOT_MARK, "1");
      listEl.addEventListener("click", onRootClick);
      group.appendChild(listEl);
    }
    listEl.className = nativeList.className;
    const labelledBy = nativeList.getAttribute("aria-labelledby");
    if (labelledBy) listEl.setAttribute("aria-labelledby", labelledBy);
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
    group.setAttribute(GROUP_MARK, "1");
    applyReactSelection(nav);
    ASF.ensureSearchBox?.(nav, listEl);
    ASF.applySearchFilter?.(nav);
    expandNativeShowMore(group).catch(() => {});
    return true;
  }

  return {
    isReactNav,
    isReactPainted,
    findReactWorkflowGroup,
    parseReactRow,
    workflowHrefFromPath,
    parseWorkflowsResponse,
    pinnedIdsFromPayload,
    collectReactWorkflowItems,
    whenReactReady,
    renderReactTree,
    applyReactSelection,
  };
});
