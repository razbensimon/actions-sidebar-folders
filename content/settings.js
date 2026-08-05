/**
 * Shared settings defaults and helpers.
 * Classic script (shared isolated world) + Node-testable export.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULTS = Object.freeze({
    disabledMode: "hide", // hide | folder | flat
    collapseFoldersByDefault: true,
  });

  const STORAGE_KEYS = Object.freeze(Object.keys(DEFAULTS));

  async function loadSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      return { ...DEFAULTS };
    }
    const stored = await chrome.storage.sync.get(DEFAULTS);
    return {
      disabledMode: normalizeDisabledMode(stored.disabledMode),
      collapseFoldersByDefault: Boolean(stored.collapseFoldersByDefault),
    };
  }

  function normalizeDisabledMode(value) {
    if (value === "hide" || value === "folder" || value === "flat") return value;
    return DEFAULTS.disabledMode;
  }

  return {
    DEFAULTS,
    STORAGE_KEYS,
    loadSettings,
    normalizeDisabledMode,
  };
});
