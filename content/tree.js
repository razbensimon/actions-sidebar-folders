/**
 * Split workflow names into a nested folder tree (max depth 3).
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_FOLDER_DEPTH = 3;

  const DEPENDABOT_WORKFLOW_PATHS = new Set([
    "dependabot/dependabot-updates",
    "dependabot/update-graph",
    // API workflow.path includes a "dynamic/" prefix; sidebar hrefs omit it.
    "dynamic/dependabot/dependabot-updates",
    "dynamic/dependabot/update-graph",
  ]);

  /**
   * @typedef {{ id: string, name: string, href: string, disabled: boolean, element?: Element }} WorkflowItem
   * @typedef {{ type: 'folder', name: string, children: Array<TreeNode> }} FolderNode
   * @typedef {{ type: 'leaf', name: string, item: WorkflowItem }} LeafNode
   * @typedef {FolderNode | LeafNode} TreeNode
   */

  /**
   * @param {string} name
   * @returns {string[]}
   */
  function splitPath(name) {
    return String(name)
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * @param {string} value
   * @returns {string | null}
   */
  function extractDependabotWorkflowPath(value) {
    const s = String(value || "");
    const fromHref = s.match(
      /\/actions\/workflows\/((?:dynamic\/)?dependabot\/[^/?#]+)/
    );
    if (fromHref) return fromHref[1];
    if (DEPENDABOT_WORKFLOW_PATHS.has(s)) return s;
    return null;
  }

  /**
   * Virtual slash path used only for nesting. Keeps display names for leaves.
   * @param {WorkflowItem} item
   * @param {{ groupDependabotWorkflows?: boolean }} [opts]
   * @returns {string}
   */
  function resolveGroupingName(item, opts = {}) {
    const groupDependabot = opts.groupDependabotWorkflows !== false;
    if (!groupDependabot) return item.name;
    const path =
      extractDependabotWorkflowPath(item.href) ||
      extractDependabotWorkflowPath(item.id);
    if (path && DEPENDABOT_WORKFLOW_PATHS.has(path)) {
      const leaf = String(item.name || "").trim() || path.split("/").pop();
      return `Dependabot / ${leaf}`;
    }
    return item.name;
  }

  /**
   * @param {WorkflowItem[]} items
   * @param {{ maxDepth?: number, groupDependabotWorkflows?: boolean }} [opts]
   * @returns {TreeNode[]}
   */
  function buildTree(items, opts = {}) {
    const maxDepth = opts.maxDepth ?? MAX_FOLDER_DEPTH;
    const groupingOpts = {
      groupDependabotWorkflows: opts.groupDependabotWorkflows,
    };

    /** @type {FolderNode[]} */
    const rootFolders = [];
    /** @type {Map<string, FolderNode>} */
    const rootMap = new Map();
    /** @type {LeafNode[]} */
    const rootLeaves = [];

    /**
     * @param {FolderNode[]} list
     * @param {Map<string, FolderNode>} map
     * @param {string} name
     * @returns {FolderNode}
     */
    function ensureFolder(list, map, name) {
      let folder = map.get(name);
      if (!folder) {
        folder = { type: "folder", name, children: [], _map: new Map() };
        map.set(name, folder);
        // If a leaf already used this name, nest it under the new folder.
        const leafIdx = list.findIndex(
          (n) => n.type === "leaf" && n.name === name
        );
        if (leafIdx >= 0) {
          const existingLeaf = list[leafIdx];
          list.splice(leafIdx, 1);
          folder.children.push(existingLeaf);
        }
        list.push(folder);
      }
      return folder;
    }

    for (const item of items) {
      const parts = splitPath(resolveGroupingName(item, groupingOpts));
      if (parts.length <= 1) {
        rootLeaves.push({
          type: "leaf",
          name: parts[0] || item.name || "(unnamed)",
          item,
        });
        continue;
      }

      const folderCount = Math.min(maxDepth, parts.length - 1);
      const folderParts = parts.slice(0, folderCount);
      const leafName = parts.slice(folderCount).join(" / ");

      let list = rootFolders;
      let map = rootMap;
      /** @type {FolderNode | null} */
      let folder = null;

      for (const part of folderParts) {
        folder = ensureFolder(list, map, part);
        list = folder.children;
        map = folder._map;
      }

      folder.children.push({
        type: "leaf",
        name: leafName,
        item,
      });
    }

    return sortLevel([...rootFolders.map(stripMaps), ...rootLeaves]);
  }

  /** @param {FolderNode} node */
  function stripMaps(node) {
    const children = node.children.map((child) =>
      child.type === "folder" ? stripMaps(child) : child
    );
    return {
      type: "folder",
      name: node.name,
      children: sortLevel(children),
    };
  }

  /** @param {TreeNode[]} nodes */
  function sortLevel(nodes) {
    const folders = nodes.filter((n) => n.type === "folder");
    const leaves = nodes.filter((n) => n.type === "leaf");
    const byName = (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    folders.sort(byName);
    leaves.sort(byName);
    return [...folders, ...leaves];
  }

  return {
    MAX_FOLDER_DEPTH,
    splitPath,
    resolveGroupingName,
    buildTree,
  };
});
