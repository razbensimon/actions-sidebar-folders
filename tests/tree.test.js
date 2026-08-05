const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildTree, splitPath, MAX_FOLDER_DEPTH } = require("../content/tree.js");

describe("splitPath", () => {
  it("trims whitespace around segments", () => {
    assert.deepEqual(splitPath("CI / Lint"), ["CI", "Lint"]);
    assert.deepEqual(splitPath("CI/Lint"), ["CI", "Lint"]);
  });
});

describe("buildTree", () => {
  it("caps folder depth at 3 and keeps remainder on the leaf", () => {
    assert.equal(MAX_FOLDER_DEPTH, 3);
    const tree = buildTree([
      {
        id: "1",
        name: "CI / Lint / JS / Unit / Foo",
        href: "/a",
        disabled: false,
      },
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, "folder");
    assert.equal(tree[0].name, "CI");
    assert.equal(tree[0].children[0].name, "Lint");
    assert.equal(tree[0].children[0].children[0].name, "JS");
    const leaf = tree[0].children[0].children[0].children[0];
    assert.equal(leaf.type, "leaf");
    assert.equal(leaf.name, "Unit / Foo");
  });

  it("places names without slash at the root", () => {
    const tree = buildTree([
      { id: "1", name: "Dependabot", href: "/d", disabled: false },
      { id: "2", name: "CI / Test", href: "/c", disabled: false },
    ]);
    assert.equal(tree[0].type, "folder");
    assert.equal(tree[0].name, "CI");
    assert.equal(tree[1].type, "leaf");
    assert.equal(tree[1].name, "Dependabot");
  });

  it("sorts folders before leaves alphabetically", () => {
    const tree = buildTree([
      { id: "1", name: "Zebra", href: "/z", disabled: false },
      { id: "2", name: "Alpha / one", href: "/a", disabled: false },
      { id: "3", name: "Beta / one", href: "/b", disabled: false },
    ]);
    assert.deepEqual(
      tree.map((n) => n.name),
      ["Alpha", "Beta", "Zebra"]
    );
  });
});
