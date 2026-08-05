/**
 * Apply disabled-workflow display policy.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * @typedef {{ id: string, name: string, href: string, disabled: boolean, element?: Element }} WorkflowItem
   */

  /**
   * @param {WorkflowItem[]} items
   * @param {'hide'|'folder'|'flat'} mode
   * @returns {{ nestable: WorkflowItem[], disabledFolderItems: WorkflowItem[] }}
   */
  function applyDisabledPolicy(items, mode) {
    const normalized =
      mode === "hide" || mode === "folder" || mode === "flat" ? mode : "hide";

    if (normalized === "flat") {
      return { nestable: items.slice(), disabledFolderItems: [] };
    }

    if (normalized === "hide") {
      return {
        nestable: items.filter((item) => !item.disabled),
        disabledFolderItems: [],
      };
    }

    // folder: nest only enabled; collect disabled for a synthetic Disabled folder
    return {
      nestable: items.filter((item) => !item.disabled),
      disabledFolderItems: items.filter((item) => item.disabled),
    };
  }

  return { applyDisabledPolicy };
});
