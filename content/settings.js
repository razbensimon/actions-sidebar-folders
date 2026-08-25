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
    groupDependabotWorkflows: true,
    showPinnedAtTop: true,
    debugMode: false,
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
      groupDependabotWorkflows:
        typeof stored.groupDependabotWorkflows === "boolean"
          ? stored.groupDependabotWorkflows
          : DEFAULTS.groupDependabotWorkflows,
      showPinnedAtTop:
        typeof stored.showPinnedAtTop === "boolean"
          ? stored.showPinnedAtTop
          : DEFAULTS.showPinnedAtTop,
      debugMode: Boolean(stored.debugMode),
    };
  }

  function normalizeDisabledMode(value) {
    if (value === "hide" || value === "folder" || value === "flat") return value;
    return DEFAULTS.disabledMode;
  }

  /** @type {boolean} */
  let debugEnabled = false;

  function setDebugEnabled(on) {
    debugEnabled = Boolean(on);
  }

  function isDebugEnabled() {
    return debugEnabled;
  }

  function serializeArg(arg) {
    if (arg instanceof Error) {
      return { name: arg.name, message: arg.message, stack: arg.stack };
    }
    if (arg && typeof arg === "object") {
      try {
        return JSON.parse(JSON.stringify(arg));
      } catch {
        return String(arg);
      }
    }
    return arg;
  }

  function bridge(level, args) {
    if (!debugEnabled) return;
    // Fire-and-forget to local pnpm dev:logs server (ignored if not running).
    try {
      fetch("http://127.0.0.1:3927/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ts: new Date().toISOString(),
          level,
          args: [...args].map(serializeArg),
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function log(...args) {
    if (!debugEnabled) return;
    console.log("[ASF]", ...args);
    bridge("log", args);
  }

  function warn(...args) {
    if (!debugEnabled) return;
    console.warn("[ASF]", ...args);
    bridge("warn", args);
  }

  return {
    DEFAULTS,
    STORAGE_KEYS,
    loadSettings,
    normalizeDisabledMode,
    setDebugEnabled,
    isDebugEnabled,
    log,
    warn,
  };
});
