const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseQuery,
  matchesTerms,
  highlightRanges,
} = require("../content/search.js");

describe("parseQuery", () => {
  it("lowercases and splits on whitespace", () => {
    assert.deepEqual(parseQuery("  CI   Lint "), ["ci", "lint"]);
  });

  it("returns empty array for blank input", () => {
    assert.deepEqual(parseQuery(""), []);
    assert.deepEqual(parseQuery("   "), []);
    assert.deepEqual(parseQuery(null), []);
  });
});

describe("matchesTerms", () => {
  it("matches case-insensitive substrings", () => {
    assert.equal(matchesTerms("CI / Lint / JS", ["lint"]), true);
    assert.equal(matchesTerms("CI / Lint / JS", ["LINT"]), false); // terms are pre-lowercased by parseQuery
    assert.equal(matchesTerms("CI / Lint / JS", parseQuery("LINT")), true);
  });

  it("requires every term to match (AND)", () => {
    assert.equal(matchesTerms("CI / Lint / JS", ["ci", "js"]), true);
    assert.equal(matchesTerms("CI / Lint / JS", ["ci", "deploy"]), false);
  });

  it("matches everything when no terms given", () => {
    assert.equal(matchesTerms("anything", []), true);
  });
});

describe("highlightRanges", () => {
  it("finds all occurrences of each term", () => {
    assert.deepEqual(highlightRanges("lint and lint", ["lint"]), [
      [0, 4],
      [9, 13],
    ]);
  });

  it("is case-insensitive against the text", () => {
    assert.deepEqual(highlightRanges("Deploy Prod", ["deploy"]), [[0, 6]]);
  });

  it("merges overlapping ranges from multiple terms", () => {
    assert.deepEqual(highlightRanges("deployment", ["deploy", "ploy"]), [
      [0, 6],
    ]);
    assert.deepEqual(highlightRanges("abcdef", ["abc", "cde"]), [[0, 5]]);
  });

  it("merges overlapping occurrences of the same term", () => {
    assert.deepEqual(highlightRanges("aaaa", ["aa"]), [[0, 4]]);
  });

  it("returns no ranges when nothing matches", () => {
    assert.deepEqual(highlightRanges("build", ["deploy"]), []);
  });
});
