const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const collapseEl = document.getElementById("collapseFoldersByDefault");

const DEFAULTS = {
  disabledMode: "hide",
  collapseFoldersByDefault: true,
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
}

async function save() {
  const selected = form.querySelector('input[name="disabledMode"]:checked');
  const disabledMode = selected?.value || DEFAULTS.disabledMode;
  await chrome.storage.sync.set({
    disabledMode,
    collapseFoldersByDefault: collapseEl.checked,
  });
  setStatus("Saved — open a GitHub Actions page to see the change.");
}

form.addEventListener("change", () => {
  save().catch((err) => setStatus(String(err.message || err)));
});

load().catch((err) => setStatus(String(err.message || err)));
