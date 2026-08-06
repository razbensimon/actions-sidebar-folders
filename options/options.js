const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const collapseEl = document.getElementById("collapseFoldersByDefault");
const groupDependabotEl = document.getElementById("groupDependabotWorkflows");
const debugEl = document.getElementById("debugMode");
const reloadBtn = document.getElementById("reload-extension");

const DEFAULTS = {
  disabledMode: "hide",
  collapseFoldersByDefault: true,
  groupDependabotWorkflows: true,
  debugMode: false,
};

function setStatus(message) {
  statusEl.textContent = message;
}

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const mode =
    stored.disabledMode === "hide" ||
    stored.disabledMode === "folder" ||
    stored.disabledMode === "flat"
      ? stored.disabledMode
      : DEFAULTS.disabledMode;
  const radio = form.querySelector(`input[name="disabledMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  collapseEl.checked = Boolean(stored.collapseFoldersByDefault);
  groupDependabotEl.checked =
    typeof stored.groupDependabotWorkflows === "boolean"
      ? stored.groupDependabotWorkflows
      : DEFAULTS.groupDependabotWorkflows;
  debugEl.checked = Boolean(stored.debugMode);
}

async function save() {
  const selected = form.querySelector('input[name="disabledMode"]:checked');
  const disabledMode = selected?.value || DEFAULTS.disabledMode;
  await chrome.storage.sync.set({
    disabledMode,
    collapseFoldersByDefault: collapseEl.checked,
    groupDependabotWorkflows: groupDependabotEl.checked,
    debugMode: debugEl.checked,
  });
  setStatus(
    debugEl.checked
      ? "Saved — open DevTools on the GitHub Actions tab to see [ASF] logs."
      : "Saved — open a GitHub Actions page to see the change."
  );
}

form.addEventListener("change", () => {
  save().catch((err) => setStatus(String(err.message || err)));
});

reloadBtn.addEventListener("click", () => {
  setStatus("Reloading extension…");
  chrome.runtime.reload();
});

load().catch((err) => setStatus(String(err.message || err)));
