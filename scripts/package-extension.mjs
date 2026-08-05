#!/usr/bin/env node
/**
 * Build a Chrome Web Store / GitHub Release zip.
 *
 * Source of truth in git keeps the local debug host permission for Load unpacked
 * + `pnpm dev:logs`. The packaged manifest strips that host only.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, "extension");

/** Hosts kept only for local Load unpacked / debug bridge — never ship to store. */
const DEV_ONLY_HOST_PERMISSIONS = new Set(["http://127.0.0.1:3927/*"]);

const INCLUDE = [
  "manifest.json",
  "service_worker.js",
  "content",
  "options",
  "icons",
  "LICENSE",
  "README.md",
  "PRIVACY.md",
];

function fail(msg) {
  console.error(`package-extension: ${msg}`);
  process.exit(1);
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`cannot read manifest: ${err.message}`);
  }
}

function stripDevHosts(manifest) {
  const hosts = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions
    : [];
  const next = hosts.filter((h) => !DEV_ONLY_HOST_PERMISSIONS.has(h));
  if (next.length === 0) fail("store manifest would have zero host_permissions");
  return { ...manifest, host_permissions: next };
}

function assertStoreSafe(manifest) {
  const hosts = manifest.host_permissions || [];
  for (const blocked of DEV_ONLY_HOST_PERMISSIONS) {
    if (hosts.includes(blocked)) {
      fail(`store manifest still contains ${blocked}`);
    }
  }
  if (!hosts.includes("https://github.com/*")) {
    fail('store manifest missing "https://github.com/*"');
  }
}

function copyTree() {
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });
  for (const name of INCLUDE) {
    const src = join(ROOT, name);
    if (!existsSync(src)) fail(`missing required path: ${name}`);
    cpSync(src, join(STAGE, name), { recursive: true });
  }
}

function writeStoreManifest() {
  const src = readManifest(join(ROOT, "manifest.json"));
  const store = stripDevHosts(src);
  assertStoreSafe(store);
  writeFileSync(
    join(STAGE, "manifest.json"),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8"
  );
  return store;
}

function zipPackage(version) {
  const zipName = `actions-sidebar-folders-${version}.zip`;
  const zipPath = join(DIST, zipName);
  rmSync(zipPath, { force: true });
  const result = spawnSync(
    "zip",
    ["-r", zipPath, ".", "-x", "*.DS_Store"],
    { cwd: STAGE, stdio: "inherit" }
  );
  if (result.status !== 0) fail("zip failed");
  return { zipName, zipPath };
}

function main() {
  mkdirSync(DIST, { recursive: true });
  copyTree();
  const manifest = writeStoreManifest();
  const { zipName, zipPath } = zipPackage(manifest.version);

  console.log("");
  console.log(`Packaged store build → ${zipPath}`);
  console.log(`  version: ${manifest.version}`);
  console.log(`  host_permissions: ${JSON.stringify(manifest.host_permissions)}`);
  console.log(
    `  (git manifest still includes ${[...DEV_ONLY_HOST_PERMISSIONS].join(", ")} for local debug)`
  );
  console.log("");
  console.log("Upload this zip to the Chrome Web Store / attach to a GitHub Release.");
  console.log(`Load unpacked for daily work: use the repo root (not dist/).`);
}

main();
