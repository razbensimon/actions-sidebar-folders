const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isPinnedElement,
  parseWorkflowElement,
  selectPinnedItems,
  dedupeByHref,
  MAX_PINNED_WORKFLOWS,
} = require("../content/fetch.js");

function mockLi({
  name = "Deploy / Orchestrator",
  href = "/o/r/actions/workflows/orch.yml",
  id = "42",
  pin = null, // "visual" | "hover" | null
  ariaLabel = null,
  pinnedAttr = null,
  disabled = false,
} = {}) {
  const label = { textContent: name };
  const anchor = {
    getAttribute(key) {
      return key === "href" ? href : null;
    },
  };
  const pinEl = {
    className: "octicon octicon-pin",
    closest(sel) {
      if (pin === "hover" && String(sel).includes("trailingAction")) {
        return {};
      }
      return null;
    },
  };
  const ariaEl = ariaLabel
    ? {
        getAttribute(key) {
          return key === "aria-label" ? ariaLabel : null;
        },
        closest() {
          return null;
        },
      }
    : null;
  const disabledEl = disabled
    ? { textContent: "Disabled", children: { length: 0 } }
    : null;

  return {
    getAttribute(key) {
      if (key === "data-item-id") return id;
      if (key === "data-asf-full-name") return null;
      if (key === "data-asf-disabled") return null;
      if (key === "data-asf-pinned") return pinnedAttr;
      return null;
    },
    querySelector(sel) {
      const parts = String(sel)
        .split(",")
        .map((part) => part.trim());
      for (const s of parts) {
        if (s.includes("ActionListContent") || s.includes("a[href")) {
          return anchor;
        }
        if (s.includes("ActionListItem-label")) return label;
        if (s.includes("trailingAction") && pin === "hover") return pinEl;
        if (s.includes("visual--trailing") && pin === "visual") return pinEl;
        if (
          /(?:^| )\.octicon-pin(?:-slash)?$/.test(s) &&
          !s.includes("visual--trailing") &&
          !s.includes("trailingAction") &&
          pin
        ) {
          return pinEl;
        }
      }
      return null;
    },
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes("aria-label") && ariaEl) return [ariaEl];
      if (disabledEl) return [disabledEl];
      return [];
    },
  };
}

describe("isPinnedElement", () => {
  it("detects GitHub's always-visible trailing pin", () => {
    assert.equal(isPinnedElement(mockLi({ pin: "visual" })), true);
  });

  it("ignores the hover pin action present on every row", () => {
    assert.equal(isPinnedElement(mockLi({ pin: "hover" })), false);
  });

  it("ignores unpinned rows", () => {
    assert.equal(isPinnedElement(mockLi({ pin: null })), false);
  });

  it("detects an Unpin aria-label", () => {
    assert.equal(
      isPinnedElement(mockLi({ pin: "hover", ariaLabel: "Unpin workflow" })),
      true
    );
  });

  it("does not treat a Pin aria-label as pinned", () => {
    assert.equal(
      isPinnedElement(mockLi({ pin: "hover", ariaLabel: "Pin workflow" })),
      false
    );
  });

  it("does not trust a leftover data-asf-pinned stamp without a real pin", () => {
    assert.equal(
      isPinnedElement(mockLi({ pin: "hover", pinnedAttr: "1" })),
      false
    );
  });
});

describe("parseWorkflowElement", () => {
  it("sets pinned from the trailing visual pin", () => {
    const item = parseWorkflowElement(mockLi({ pin: "visual", id: "7" }));
    assert.equal(item.pinned, true);
    assert.equal(item.id, "7");
    assert.equal(item.name, "Deploy / Orchestrator");
  });

  it("sets pinned false for hover-only pin controls", () => {
    const item = parseWorkflowElement(mockLi({ pin: "hover" }));
    assert.equal(item.pinned, false);
  });
});

describe("selectPinnedItems", () => {
  const items = [
    { id: "1", name: "CI / Lint", href: "/a", pinned: false },
    { id: "2", name: "Deploy / Orchestrator", href: "/b", pinned: true },
    { id: "3", name: "Deploy / Prerequisites Infra", href: "/c", pinned: true },
    { id: "4", name: "CI / Test", href: "/d", pinned: false },
  ];

  it("returns pinned items in original order when enabled", () => {
    assert.deepEqual(
      selectPinnedItems(items, true).map((i) => i.id),
      ["2", "3"]
    );
  });

  it("returns nothing when the setting is off", () => {
    assert.deepEqual(selectPinnedItems(items, false), []);
  });

  it("defaults to enabled", () => {
    assert.equal(selectPinnedItems(items).length, 2);
  });

  it("caps at GitHub's max of 5 pinned workflows", () => {
    assert.equal(MAX_PINNED_WORKFLOWS, 5);
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: `W ${i}`,
      href: `/${i}`,
      pinned: true,
    }));
    assert.deepEqual(
      selectPinnedItems(many).map((i) => i.id),
      ["0", "1", "2", "3", "4"]
    );
  });
});

describe("dedupeByHref", () => {
  it("keeps pinned when either duplicate is pinned", () => {
    const merged = dedupeByHref([
      {
        id: "1",
        name: "Deploy / Orchestrator",
        href: "/b",
        pinned: false,
        disabled: false,
      },
      {
        id: "1",
        name: "Deploy / Orchestrator",
        href: "/b",
        pinned: true,
        disabled: false,
      },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].pinned, true);
  });
});
