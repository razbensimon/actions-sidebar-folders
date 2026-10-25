const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  workflowHrefFromPath,
  parseWorkflowsResponse,
  pinnedIdsFromPayload,
} = require("../content/react.js");

const repo = { owner: "o", repo: "r" };

describe("workflowHrefFromPath", () => {
  it("uses the file name for repo workflows", () => {
    assert.equal(
      workflowHrefFromPath(repo, ".github/workflows/ci.yml"),
      "/o/r/actions/workflows/ci.yml"
    );
  });

  it("strips dynamic/ for GitHub-managed workflows", () => {
    assert.equal(
      workflowHrefFromPath(repo, "dynamic/dependabot/dependabot-updates"),
      "/o/r/actions/workflows/dependabot/dependabot-updates"
    );
    assert.equal(
      workflowHrefFromPath(repo, "dynamic/github-code-scanning/codeql"),
      "/o/r/actions/workflows/github-code-scanning/codeql"
    );
  });

  it("returns empty without a repo or path", () => {
    assert.equal(workflowHrefFromPath(null, ".github/workflows/ci.yml"), "");
    assert.equal(workflowHrefFromPath(repo, ""), "");
  });
});

describe("parseWorkflowsResponse", () => {
  const json = {
    meta: { title: null },
    payload: {
      workflowsSidebarRoute: {
        totalCount: 61,
        workflows: [
          { id: 1, name: "CI / Lint", path: ".github/workflows/lint.yml", state: "active" },
          { id: 2, name: "Old", path: ".github/workflows/old.yml", state: "disabled_manually" },
          { id: 3, name: "Dependabot Updates", path: "dynamic/dependabot/dependabot-updates", state: "active" },
          { id: 4, name: "", path: ".github/workflows/x.yml", state: "active" },
        ],
      },
    },
  };

  it("maps workflows to items with derived hrefs", () => {
    const { items, totalCount } = parseWorkflowsResponse(json, repo);
    assert.equal(totalCount, 61);
    assert.deepEqual(items, [
      { id: "1", name: "CI / Lint", href: "/o/r/actions/workflows/lint.yml", disabled: false, pinned: false },
      { id: "2", name: "Old", href: "/o/r/actions/workflows/old.yml", disabled: true, pinned: false },
      {
        id: "3",
        name: "Dependabot Updates",
        href: "/o/r/actions/workflows/dependabot/dependabot-updates",
        disabled: false,
        pinned: false,
      },
    ]);
  });

  it("finds the workflows route under another key", () => {
    const renamed = { payload: { someOtherRoute: json.payload.workflowsSidebarRoute } };
    assert.equal(parseWorkflowsResponse(renamed, repo).items.length, 3);
  });

  it("returns nothing for unexpected shapes", () => {
    assert.deepEqual(parseWorkflowsResponse(null, repo), { items: [], totalCount: 0 });
    assert.deepEqual(parseWorkflowsResponse({ payload: {} }, repo), { items: [], totalCount: 0 });
  });
});

describe("pinnedIdsFromPayload", () => {
  it("collects pinned ids from nested routes as strings", () => {
    const ids = pinnedIdsFromPayload({
      allWorkflowRunsRoute: { pinnedWorkflowIds: ["10", "20"] },
      workflowsLayoutRoute: { pinnedWorkflowIds: [20, 30] },
    });
    assert.deepEqual([...ids].sort(), ["10", "20", "30"]);
  });

  it("is empty when nothing is pinned", () => {
    assert.equal(pinnedIdsFromPayload({}).size, 0);
    assert.equal(pinnedIdsFromPayload(null).size, 0);
  });
});
