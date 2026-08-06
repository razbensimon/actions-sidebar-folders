const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTree,
  splitPath,
  MAX_FOLDER_DEPTH,
  resolveGroupingName,
} = require("../content/tree.js");

describe("splitPath", () => {
  it("trims whitespace around segments", () => {
    assert.deepEqual(splitPath("CI / Lint"), ["CI", "Lint"]);
    assert.deepEqual(splitPath("CI/Lint"), ["CI", "Lint"]);
  });
});

describe("resolveGroupingName", () => {
  it("maps Dependabot platform hrefs under Dependabot / <display name>", () => {
    // Sidebar hrefs omit the API "dynamic/" prefix.
    assert.equal(
      resolveGroupingName({
        id: "1",
        name: "Dependabot Updates",
        href: "/o/r/actions/workflows/dependabot/dependabot-updates",
        disabled: false,
      }),
      "Dependabot / Dependabot Updates"
    );
    assert.equal(
      resolveGroupingName({
        id: "2",
        name: "Dependency Graph",
        href: "/o/r/actions/workflows/dependabot/update-graph",
        disabled: false,
      }),
      "Dependabot / Dependency Graph"
    );
  });

  it("also accepts API-style dynamic/ paths", () => {
    assert.equal(
      resolveGroupingName({
        id: "1",
        name: "Dependabot Updates",
        href: "/o/r/actions/workflows/dynamic/dependabot/dependabot-updates",
        disabled: false,
      }),
      "Dependabot / Dependabot Updates"
    );
  });

  it("falls back to id when href is missing", () => {
    assert.equal(
      resolveGroupingName({
        id: "dynamic/dependabot/update-graph",
        name: "Dependency Graph",
        href: "",
        disabled: false,
      }),
      "Dependabot / Dependency Graph"
    );
  });

  it("leaves normal workflows unchanged", () => {
    assert.equal(
      resolveGroupingName({
        id: "1",
        name: "CI / Test",
        href: "/o/r/actions/workflows/ci.yml",
        disabled: false,
      }),
      "CI / Test"
    );
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
      { id: "1", name: "Lint", href: "/d", disabled: false },
      { id: "2", name: "CI / Test", href: "/c", disabled: false },
    ]);
    assert.equal(tree[0].type, "folder");
    assert.equal(tree[0].name, "CI");
    assert.equal(tree[1].type, "leaf");
    assert.equal(tree[1].name, "Lint");
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

  it("nests both managed Dependabot workflows under Dependabot", () => {
    const tree = buildTree([
      {
        id: "1",
        name: "Dependabot Updates",
        href: "/o/r/actions/workflows/dependabot/dependabot-updates",
        disabled: false,
      },
      {
        id: "2",
        name: "Dependency Graph",
        href: "/o/r/actions/workflows/dependabot/update-graph",
        disabled: false,
      },
      {
        id: "3",
        name: "CI / Test",
        href: "/o/r/actions/workflows/ci.yml",
        disabled: false,
      },
    ]);
    assert.deepEqual(
      tree.map((n) => n.name),
      ["CI", "Dependabot"]
    );
    const dep = tree.find((n) => n.name === "Dependabot");
    assert.equal(dep.type, "folder");
    assert.deepEqual(
      dep.children.map((n) => n.name),
      ["Dependabot Updates", "Dependency Graph"]
    );
    assert.equal(dep.children[0].item.name, "Dependabot Updates");
    assert.equal(
      dep.children[0].item.href,
      "/o/r/actions/workflows/dependabot/dependabot-updates"
    );
  });
});
