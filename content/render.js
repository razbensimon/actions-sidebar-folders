/**
 * Render nested workflow folders into the Actions sidebar.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FOLDER_CLASS = "asf-folder-group";
  const FOLDER_HEADER = "asf-folder";
  const FOLDER_OPEN = "asf-folder-group--open";
  const NEST_CLASS = "asf-folder-children";
  const ROOT_MARK = "data-asf-rooted";
  const ACTIVE_CLASS = "ActionListItem--navActive";

  const CHEVRON_SVG = `
    <svg class="asf-folder-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" fill="currentColor"></path>
    </svg>
  `.trim();

  /** Management lives in its own ActionListWrap — never paint folders there. */
  function isManagementList(ul) {
    if (!ul || ul.nodeType !== 1) return false;
    if (
      ul.querySelector(
        '[data-item-id="caches"], [data-item-id="deployments"], [data-item-id="runners"], [data-item-id="attestations"]'
      )
    ) {
      return true;
    }
    const labelId = ul.getAttribute("aria-labelledby");
    if (labelId) {
      const heading = ul.ownerDocument.getElementById(labelId);
      if (heading && /^\s*Management\s*$/i.test(heading.textContent || "")) {
        return true;
      }
    }
    const title = ul
      .closest("nav-list-group, action-list, li")
      ?.querySelector?.(".ActionList-sectionDivider-title");
    return Boolean(
      title && /^\s*Management\s*$/i.test(title.textContent || "")
    );
  }

  function candidateWraps(nav) {
    return [...nav.querySelectorAll("ul.ActionListWrap")].filter(
      (ul) =>
        !ul.classList.contains(NEST_CLASS) &&
        ul.getAttribute("data-target") !== "nav-list.topLevelList" &&
        !isManagementList(ul)
    );
  }

  function findWorkflowList(nav) {
    let list = null;

    const marked = nav.querySelector(`ul[${ROOT_MARK}], [${ROOT_MARK}]`);
    if (marked) {
      const ul =
        marked.tagName === "UL" ? marked : marked.querySelector("ul") || marked;
      if (ul && !isManagementList(ul)) {
        list = ul;
      } else {
        // Stale mark on Management (or other non-workflow list) — drop it.
        marked.removeAttribute?.(ROOT_MARK);
        if (ul && ul !== marked) ul.removeAttribute?.(ROOT_MARK);
      }
    }

    if (!list) {
      const topLevelItem = [
        ...nav.querySelectorAll('li[data-test-selector="workflow-rendered"]'),
      ].find((li) => !li.closest("." + FOLDER_CLASS));
      if (
        topLevelItem?.parentElement &&
        !isManagementList(topLevelItem.parentElement)
      ) {
        list = topLevelItem.parentElement;
      }
    }

    if (!list) {
      const leaf = nav.querySelector("[data-asf-leaf]");
      if (leaf?.parentElement && !isManagementList(leaf.parentElement)) {
        // Parent may be a nested folder list — walk up to rooted/group wrap.
        const rooted = leaf.closest(`ul[${ROOT_MARK}]`);
        if (rooted && !isManagementList(rooted)) {
          list = rooted;
        } else {
          const wrap = leaf.closest("ul.ActionListWrap");
          if (
            wrap &&
            !isManagementList(wrap) &&
            !wrap.classList.contains(NEST_CLASS)
          ) {
            list = wrap;
          }
        }
      }
    }

    if (!list) {
      const showMore = nav.querySelector(
        "[data-target='nav-list-group.showMoreItem'], [src*='workflows_partial']"
      );
      if (
        showMore?.parentElement &&
        !isManagementList(showMore.parentElement)
      ) {
        list = showMore.parentElement;
      }
    }

    if (!list) {
      const wraps = candidateWraps(nav);
      const withHint = wraps.find((ul) =>
        ul.querySelector(
          '[data-test-selector="workflow-rendered"], [data-asf-leaf], .' +
            FOLDER_CLASS +
            ", [src*='workflows_partial']"
        )
      );
      // After prune, workflow <ul> is empty but still precedes Management.
      list = withHint || wraps[0] || null;
    }

    return list;
  }

  /** Remove folders/leaves painted into the wrong list (e.g. Management). */
  function scrubMisplacedPaint(nav, keepList) {
    nav.querySelectorAll("." + FOLDER_CLASS + ", [data-asf-leaf]").forEach((el) => {
      if (keepList && keepList.contains(el)) return;
      el.remove();
    });
    nav.querySelectorAll(`[${ROOT_MARK}]`).forEach((el) => {
      if (el !== keepList) el.removeAttribute(ROOT_MARK);
    });
  }

  function clearWorkflowList(listEl) {
    [...listEl.children].forEach((child) => {
      if (
        child.matches?.(
          'li[data-test-selector="workflow-rendered"], .' +
            FOLDER_CLASS +
            ", [data-target='nav-list-group.showMoreItem'], [src*='workflows_partial']"
        )
      ) {
        child.remove();
        return;
      }
      const text = (child.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Show more workflows/i.test(text)) child.remove();
    });
  }

  function setLeafLabel(li, displayName) {
    const label = li.querySelector(".ActionListItem-label");
    if (label) label.textContent = displayName;
  }

  function ensureLeafElement(leaf) {
    const item = leaf.item;
    let li = item.element;
    if (!li || li.ownerDocument !== document) {
      if (li) {
        li = document.importNode(li, true);
      } else {
        li = document.createElement("li");
        li.setAttribute("data-test-selector", "workflow-rendered");
        li.className = "actions-workflow-list-item ActionListItem";
        const a = document.createElement("a");
        a.className = "ActionListContent";
        a.href = item.href || "#";
        const span = document.createElement("span");
        span.className = "ActionListItem-label ActionListItem-label--truncate";
        span.textContent = leaf.name;
        a.appendChild(span);
        li.appendChild(a);
      }
      item.element = li;
    }
    // Persist stable id so later DOM collects don't key by href alone.
    if (item.id) li.setAttribute("data-item-id", String(item.id));
    // Drop previous flex-gutter hacks if reusing a node.
    li.querySelector(".asf-leaf-gutter")?.remove();
    li.querySelector("a.ActionListContent")?.classList.remove("asf-leaf-link");
    setLeafLabel(li, leaf.name);
    li.setAttribute("data-asf-leaf", "1");
    if (item.name) li.setAttribute("data-asf-full-name", item.name);
    if (item.disabled) li.setAttribute("data-asf-disabled", "1");
    else li.removeAttribute("data-asf-disabled");
    return li;
  }

  /**
   * GitHub/Turbo often re-injects flat workflow <li>s (top-level or into our
   * folder lists). Remove every unmarked row under the nav.
   */
  function pruneStrayNativeWorkflows(nav) {
    if (!nav) return 0;
    let removed = 0;
    nav
      .querySelectorAll(
        'li[data-test-selector="workflow-rendered"]:not([data-asf-leaf])'
      )
      .forEach((el) => {
        el.remove();
        removed += 1;
      });
    nav
      .querySelectorAll(
        "[data-target='nav-list-group.showMoreItem'], [src*='workflows_partial']"
      )
      .forEach((el) => {
        el.remove();
        removed += 1;
      });
    nav.querySelectorAll("button, a, span, div").forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Show more workflows/i.test(text) && text.length < 40) {
        const row =
          el.closest("[data-target='nav-list-group.showMoreItem']") ||
          el.closest(".ActionListItem") ||
          el;
        if (row.isConnected) {
          row.remove();
          removed += 1;
        }
      }
    });
    return removed;
  }

  function hasStrayNativeWorkflows(nav) {
    if (!nav) return false;
    return Boolean(
      nav.querySelector(
        'li[data-test-selector="workflow-rendered"]:not([data-asf-leaf])'
      )
    );
  }

  function isActivePath(href) {
    if (!href) return false;
    try {
      const current = location.pathname.replace(/\/$/, "");
      const target = new URL(href, location.origin).pathname.replace(/\/$/, "");
      return current === target || current.startsWith(target + "/");
    } catch {
      return false;
    }
  }

  function pathContainsActive(node) {
    if (node.type === "leaf") {
      return isActivePath(node.item.href);
    }
    return node.children.some(pathContainsActive);
  }

  function clearActiveStates(nav) {
    nav.querySelectorAll("." + ACTIVE_CLASS).forEach((el) => {
      el.classList.remove(ACTIVE_CLASS);
      el.querySelector("a[aria-current]")?.removeAttribute("aria-current");
    });
  }

  function markLeafActive(li) {
    li.classList.add(ACTIVE_CLASS);
    const anchor = li.querySelector("a.ActionListContent");
    if (anchor) anchor.setAttribute("aria-current", "page");
  }

  function applySelection(nav) {
    clearActiveStates(nav);
    let matched = false;
    nav
      .querySelectorAll(
        'li[data-test-selector="workflow-rendered"][data-asf-leaf]'
      )
      .forEach((li) => {
        const href = li
          .querySelector("a.ActionListContent")
          ?.getAttribute("href");
        if (isActivePath(href)) {
          markLeafActive(li);
          matched = true;
        }
      });
    if (!matched) {
      const all = nav.querySelector('li[data-item-id="all_workflows"]');
      if (all) {
        all.classList.add(ACTIVE_CLASS);
        all.querySelector("a")?.setAttribute("aria-current", "page");
      }
    }
  }

  function createFolderElement(folder, settings) {
    // Wrapper is NOT ActionListItem — nesting ul inside ActionListItem breaks
    // Primer's active indicator / padding. Header row is a normal ActionListItem.
    const group = document.createElement("li");
    group.className = FOLDER_CLASS;
    group.setAttribute("data-asf-folder", folder.name);
    group.setAttribute("role", "presentation");

    const header = document.createElement("div");
    header.className = `ActionListItem ${FOLDER_HEADER}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ActionListContent asf-folder-toggle";
    button.setAttribute("aria-expanded", "false");

    const chevronWrap = document.createElement("span");
    chevronWrap.className = "asf-folder-chevron-wrap";
    chevronWrap.setAttribute("aria-hidden", "true");
    chevronWrap.innerHTML = CHEVRON_SVG;

    const label = document.createElement("span");
    label.className = "ActionListItem-label";
    label.textContent = folder.name;

    const count = document.createElement("span");
    count.className = "asf-folder-count";
    count.textContent = String(countLeaves(folder));

    button.append(chevronWrap, label, count);
    header.appendChild(button);
    group.appendChild(header);

    const childList = document.createElement("ul");
    childList.className = `ActionListWrap ${NEST_CLASS}`;
    childList.hidden = true;

    for (const child of folder.children) {
      if (child.type === "folder") {
        childList.appendChild(createFolderElement(child, settings));
      } else {
        childList.appendChild(ensureLeafElement(child));
      }
    }

    group.appendChild(childList);

    const forceOpen = pathContainsActive(folder);
    const open = forceOpen || settings.collapseFoldersByDefault === false;
    setFolderOpen(group, open);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFolderOpen(group, !group.classList.contains(FOLDER_OPEN));
    });

    return group;
  }

  function countLeaves(node) {
    if (node.type === "leaf") return 1;
    return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
  }

  function setFolderOpen(group, open) {
    const button = group.querySelector(":scope > .asf-folder > .asf-folder-toggle");
    const childList = group.querySelector(":scope > ." + NEST_CLASS);
    group.classList.toggle(FOLDER_OPEN, open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    if (childList) childList.hidden = !open;
  }

  function renderTree(nav, tree, settings, disabledFolderItems = []) {
    const listEl = findWorkflowList(nav);
    if (!listEl) return false;

    // Drop any prior paint that landed in Management (or elsewhere).
    scrubMisplacedPaint(nav, listEl);
    clearWorkflowList(listEl);
    globalThis.ASF?.removeShowMoreControls?.(nav);

    const nodes = tree.slice();
    if (disabledFolderItems.length > 0) {
      nodes.push({
        type: "folder",
        name: "Disabled",
        children: disabledFolderItems
          .slice()
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          )
          .map((item) => ({
            type: "leaf",
            name: item.name,
            item,
          })),
      });
    }

    const disabled = nodes.filter(
      (n) => n.type === "folder" && n.name === "Disabled"
    );
    const rest = nodes.filter(
      (n) => !(n.type === "folder" && n.name === "Disabled")
    );
    const ordered = [...rest, ...disabled];

    for (const node of ordered) {
      if (node.type === "folder") {
        const folderEl = createFolderElement(node, {
          ...settings,
          collapseFoldersByDefault:
            node.name === "Disabled" ? true : settings.collapseFoldersByDefault,
        });
        listEl.appendChild(folderEl);
      } else {
        listEl.appendChild(ensureLeafElement(node));
      }
    }

    listEl.setAttribute(ROOT_MARK, "1");
    applySelection(nav);
    pruneStrayNativeWorkflows(nav);
    collapseAdjacentDividers(nav);
    globalThis.ASF?.removeShowMoreControls?.(nav);
    // Search box lives outside listEl so it survives repaints; re-apply the
    // active query since leaf labels were just reset to plain text.
    globalThis.ASF?.ensureSearchBox?.(nav, listEl);
    globalThis.ASF?.applySearchFilter?.(nav);

    return true;
  }

  /** Remove back-to-back section dividers (double-line glitch). */
  function collapseAdjacentDividers(nav) {
    if (!nav) return 0;
    let removed = 0;
    // Walk nav children / nested lists — GitHub may stack two divider <li>s
    // with only whitespace between them, or both as direct ActionList siblings.
    const candidates = [...nav.querySelectorAll("li.ActionList-sectionDivider, .ActionList-sectionDivider")];
    for (let i = 0; i < candidates.length - 1; i++) {
      const a = candidates[i];
      const b = candidates[i + 1];
      if (!a.isConnected || !b.isConnected) continue;
      let next = a.nextElementSibling;
      while (next && next !== b) {
        const t = (next.textContent || "").trim();
        const isEmpty =
          !t ||
          next.matches?.("li:empty") ||
          (next.children.length === 0 && !t);
        if (!isEmpty) break;
        next = next.nextElementSibling;
      }
      if (next === b || a.nextElementSibling === b) {
        b.remove();
        removed += 1;
      }
    }
    return removed;
  }

  return {
    FOLDER_CLASS,
    findWorkflowList,
    renderTree,
    setFolderOpen,
    pathContainsActive,
    applySelection,
    pruneStrayNativeWorkflows,
    hasStrayNativeWorkflows,
    collapseAdjacentDividers,
  };
});
