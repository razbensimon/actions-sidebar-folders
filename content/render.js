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

  function findWorkflowList(nav) {
    const item = nav.querySelector('li[data-test-selector="workflow-rendered"]');
    if (item?.parentElement) return item.parentElement;
    const showMore = nav.querySelector("[data-target='nav-list-group.showMoreItem']");
    if (showMore?.parentElement) return showMore.parentElement;
    return null;
  }

  function clearWorkflowList(listEl) {
    listEl
      .querySelectorAll(
        'li[data-test-selector="workflow-rendered"], .' + FOLDER_CLASS + ', [data-target="nav-list-group.showMoreItem"]'
      )
      .forEach((el) => el.remove());
  }

  function setLeafLabel(li, displayName) {
    const label = li.querySelector(".ActionListItem-label");
    if (label) label.textContent = displayName;
  }

  function ensureLeafElement(leaf) {
    const item = leaf.item;
    let li = item.element;
    if (!li || li.ownerDocument !== document) {
      // Adopt parsed node into the live document.
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
    setLeafLabel(li, leaf.name);
    return li;
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

  function createFolderElement(folder, settings) {
    const li = document.createElement("li");
    li.className = `ActionListItem ${FOLDER_CLASS}`;
    li.setAttribute("data-asf-folder", folder.name);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ActionListContent asf-folder-toggle";
    button.setAttribute("aria-expanded", "false");

    const chevron = document.createElement("span");
    chevron.className = "asf-folder-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▸";

    const label = document.createElement("span");
    label.className = "ActionListItem-label";
    label.textContent = folder.name;

    const count = document.createElement("span");
    count.className = "asf-folder-count";
    count.textContent = String(countLeaves(folder));

    button.append(chevron, label, count);
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
    const chevron = li.querySelector(":scope > .asf-folder-toggle .asf-folder-chevron");
    li.classList.toggle(FOLDER_OPEN, open);
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    if (childList) childList.hidden = !open;
    if (chevron) chevron.textContent = open ? "▾" : "▸";
  }

  /**
   * @param {Element} nav
   * @param {import('./tree.js').TreeNode[]} tree
   * @param {{ collapseFoldersByDefault: boolean }} settings
   * @param {import('./tree.js').WorkflowItem[]} [disabledFolderItems]
   */
  function renderTree(nav, tree, settings, disabledFolderItems = []) {
    const listEl = findWorkflowList(nav);
    if (!listEl) return false;

    clearWorkflowList(listEl);

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

    // Keep Disabled after normal folders/leaves — re-sort top level with Disabled last
    const disabled = nodes.filter((n) => n.type === "folder" && n.name === "Disabled");
    const rest = nodes.filter((n) => !(n.type === "folder" && n.name === "Disabled"));
    const ordered = [...rest, ...disabled];

    for (const node of ordered) {
      if (node.type === "folder") {
        const folderEl = createFolderElement(node, {
          ...settings,
          // Disabled folder always starts collapsed unless it contains the active workflow
          collapseFoldersByDefault:
            node.name === "Disabled" ? true : settings.collapseFoldersByDefault,
        });
        listEl.appendChild(folderEl);
      } else {
        listEl.appendChild(ensureLeafElement(node));
      }
    }

    listEl.setAttribute(ROOT_MARK, "1");
    return true;
  }

  return {
    FOLDER_CLASS,
    findWorkflowList,
    renderTree,
    pathContainsActive,
  };
});
