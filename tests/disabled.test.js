const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyDisabledPolicy } = require("../content/disabled.js");

const items = [
  { id: "1", name: "CI / A", href: "/a", disabled: false },
  { id: "2", name: "Old", href: "/o", disabled: true },
  { id: "3", name: "Deploy / B", href: "/b", disabled: true },
];

describe("applyDisabledPolicy", () => {
  it("hides disabled items by default mode", () => {
    const result = applyDisabledPolicy(items, "hide");
    assert.equal(result.nestable.length, 1);
    assert.equal(result.nestable[0].id, "1");
    assert.equal(result.disabledFolderItems.length, 0);
  });

  it("collects disabled items for a Disabled folder", () => {
    const result = applyDisabledPolicy(items, "folder");
    assert.equal(result.nestable.length, 1);
    assert.equal(result.disabledFolderItems.length, 2);
    assert.deepEqual(
      result.disabledFolderItems.map((i) => i.id).sort(),
      ["2", "3"]
    );
  });

  it("leaves all items nestable in flat mode", () => {
    const result = applyDisabledPolicy(items, "flat");
    assert.equal(result.nestable.length, 3);
    assert.equal(result.disabledFolderItems.length, 0);
  });
});
