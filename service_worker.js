/* Service worker: install defaults only. No GitHub fetches. */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install" && details.reason !== "update") return;
  const defaults = {
    disabledMode: "hide",
    collapseFoldersByDefault: true,
    debugMode: false,
  };
  const current = await chrome.storage.sync.get(defaults);
  await chrome.storage.sync.set({
    disabledMode:
      current.disabledMode === "hide" ||
      current.disabledMode === "folder" ||
      current.disabledMode === "flat"
        ? current.disabledMode
        : defaults.disabledMode,
    collapseFoldersByDefault:
      typeof current.collapseFoldersByDefault === "boolean"
        ? current.collapseFoldersByDefault
        : defaults.collapseFoldersByDefault,
    debugMode:
      typeof current.debugMode === "boolean"
        ? current.debugMode
        : defaults.debugMode,
  });
});
