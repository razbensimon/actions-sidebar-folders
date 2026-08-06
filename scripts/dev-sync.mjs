#!/usr/bin/env node
/**
 * Pull the checkout that Chrome has loaded unpacked, then nudge Chrome.
 *
 *   pnpm dev:sync
 *
 * Chrome caches unpacked extension files at load time, so new content-script
 * or manifest bytes only take effect after the extension itself is reloaded —
 * that click on chrome://extensions cannot be scripted. This handles the rest:
 * fast-forwards the checkout, reports what moved, and reloads open Actions tabs.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS_URL = "chrome://extensions";

function git(...args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
  return result.stdout.trim();
}

function reloadActionsTabs() {
  if (process.platform !== "darwin") return null;
  // Only touches tabs already sitting on an Actions page; never opens one.
  const script = `
    tell application "Google Chrome"
      if it is not running then return "not-running"
      set reloaded to 0
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "github.com" and URL of t contains "/actions" then
            reload t
            set reloaded to reloaded + 1
          end if
        end repeat
      end repeat
      return reloaded as string
    end tell
  `;
  const result = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function main() {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const dirty = git("status", "--porcelain");
  if (dirty) {
    console.error(`dev-sync: ${ROOT} has uncommitted changes — pull skipped.`);
    console.error(dirty);
    process.exit(1);
  }

  const before = git("rev-parse", "HEAD");
  console.log(`dev-sync: pulling ${branch} in ${ROOT}`);
  git("pull", "--ff-only");
  const after = git("rev-parse", "HEAD");

  if (before === after) {
    console.log(`dev-sync: already up to date (${after.slice(0, 7)})`);
  } else {
    const files = git("diff", "--name-only", before, after);
    console.log(
      `dev-sync: ${before.slice(0, 7)} → ${after.slice(0, 7)}\n${files}`
    );
  }

  const reloaded = reloadActionsTabs();
  if (reloaded && reloaded !== "not-running" && reloaded !== "0") {
    console.log(`dev-sync: reloaded ${reloaded} Actions tab(s)`);
  }

  console.log("");
  console.log(`Now click Reload on the extension card at ${EXTENSIONS_URL}`);
  console.log("(Chrome only re-reads extension files on reload, then the tab refresh above applies them.)");
}

try {
  main();
} catch (err) {
  console.error(`dev-sync: ${err.message}`);
  process.exit(1);
}
