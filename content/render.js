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
  const FOLDER_CLASS = "asf-folder";
  const FOLDER_OPEN = "asf-folder--open";
  const NEST_CLASS = "asf-folder-children";
  const ROOT_MARK = "data-asf-rooted";
  const ACTIVE_CLASS = "ActionListItem--navActive";

  const CHEVRON_SVG = `
    <svg class="asf-folder-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" fill="currentColor"></path>
    </svg>
  `.trim();

  function findWorkflowList(nav) {
    const marked = nav.querySelector(`ul[${ROOT_MARK}], [${ROOT_MARK}]`);
    if (marked) {
      return marked.tagName === "UL" ? marked : marked.querySelector("ul") || marked;
    }

    const topLevelItem = [
      ...nav.querySelectorAll('li[data-test-selector="workflow-rendered"]'),
    ].find((li) => !li.closest("." + FOLDER_CLASS));
    if (topLevelItem?.parentElement) return topLevelItem.parentElement;

    const showMore = nav.querySelector(
      "[data-target='nav-list-group.showMoreItem']"
    );
    if (showMore?.parentElement) return showMore.parentElement;

    const wraps = [...nav.querySelectorAll("ul.ActionListWrap")].filter(
      (ul) => !ul.classList.contains(NEST_CLASS)
    );
    return wraps[wraps.length - 1] || null;
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

  function ensureLeafGutter(li) {
    const anchor = li.querySelector("a.ActionListContent");
    if (!anchor || anchor.querySelector(".asf-leaf-gutter")) return;
    // Nested leaves only — root leaves stay flush with GitHub’s list.
    if (!li.closest("." + NEST_CLASS)) return;
    const gutter = document.createElement("span");
    gutter.className = "asf-leaf-gutter";
    gutter.setAttribute("aria-hidden", "true");
    anchor.prepend(gutter);
    anchor.classList.add("asf-leaf-link");
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
        a.className = "ActionListContent asf-leaf-link";
        a.href = item.href || "#";
        const span = document.createElement("span");
        span.className = "ActionListItem-label ActionListItem-label--truncate";
        span.textContent = leaf.name;
        a.appendChild(span);
        li.appendChild(a);
      }
      item.element = li;
    }
    setLeafLabel(li, leaf.name);
    ensureLeafGutter(li);
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
    const li = document.createElement("li");
    li.className = `ActionListItem ${FOLDER_CLASS}`;
    li.setAttribute("data-asf-folder", folder.name);

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
    li.appendChild(button);

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

    li.appendChild(childList);

    const forceOpen = pathContainsActive(folder);
    const open = forceOpen || settings.collapseFoldersByDefault === false;
    setFolderOpen(li, open);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFolderOpen(li, !li.classList.contains(FOLDER_OPEN));
    });

    return li;
  }

  function countLeaves(node) {
    if (node.type === "leaf") return 1;
    return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
  }

  function setFolderOpen(li, open) {
    const button = li.querySelector(":scope > .asf-folder-toggle");
    const childList = li.querySelector(":scope > ." + NEST_CLASS);
    li.classList.toggle(FOLDER_OPEN, open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    if (childList) childList.hidden = !open;
  }

  function renderTree(nav, tree, settings, disabledFolderItems = []) {
    const listEl = findWorkflowList(nav);
    if (!listEl) return false;

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
    globalThis.ASF?.removeShowMoreControls?.(nav);
    return true;
  }

  return {
    FOLDER_CLASS,
    findWorkflowList,
    renderTree,
    pathContainsActive,
    applySelection,
    pruneStrayNativeWorkflows,
    hasStrayNativeWorkflows,
  };
});
