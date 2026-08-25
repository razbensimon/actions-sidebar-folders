const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULTS, loadSettings } = require("../content/settings.js");

describe("DEFAULTS", () => {
  it("shows pinned workflows at the top by default", () => {
    assert.equal(DEFAULTS.showPinnedAtTop, true);
  });
});

describe("loadSettings", () => {
  it("returns showPinnedAtTop true when chrome storage is unavailable", async () => {
    const settings = await loadSettings();
    assert.equal(settings.showPinnedAtTop, true);
  });
});
