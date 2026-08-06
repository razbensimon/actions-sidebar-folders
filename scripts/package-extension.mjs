#!/usr/bin/env node
/**
 * Build Chrome Web Store / GitHub Release zip + CRX.
 *
 * Source of truth in git keeps the local debug host permission for Load unpacked
 * + `pnpm dev:logs`. The packaged manifest strips that host only.
 *
 * CRX is signed with a persistent PEM (default:
 * ~/.config/actions-sidebar-folders/extension.pem — outside the Load unpacked
 * root so Chrome never ships the private key). Override with ASF_CRX_KEY_PATH.
 * Keep a backup; losing it changes the extension ID.
 */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crx3 from "crx3";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, "extension");
const LEGACY_KEY = join(ROOT, "keys", "extension.pem");
const DEFAULT_KEY = join(
  homedir(),
  ".config",
  "actions-sidebar-folders",
  "extension.pem"
);

/** Hosts kept only for local Load unpacked / debug bridge — never ship to store. */
const DEV_ONLY_HOST_PERMISSIONS = new Set(["http://127.0.0.1:3927/*"]);

const INCLUDE = [
  "manifest.json",
  "service_worker.js",
  "content",
  "options",
  "icons",
  "LICENSE",
  "NOTICE",
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

function resolveKeyPath() {
  if (process.env.ASF_CRX_KEY_PATH) return process.env.ASF_CRX_KEY_PATH;
  // Migrate legacy in-repo key out of the Load unpacked root (Chrome warns on *.pem).
  if (existsSync(LEGACY_KEY) && !existsSync(DEFAULT_KEY)) {
    mkdirSync(dirname(DEFAULT_KEY), { recursive: true });
    renameSync(LEGACY_KEY, DEFAULT_KEY);
    try {
      rmSync(join(ROOT, "keys"), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    console.log(
      `package-extension: moved signing key ${LEGACY_KEY} → ${DEFAULT_KEY}`
    );
  }
  return DEFAULT_KEY;
}

/** Ensure a PEM exists before crx3 runs (avoids its first-run ENOENT noise). */
function ensureSigningKey(keyPath) {
  if (existsSync(keyPath)) return false;
  mkdirSync(dirname(keyPath), { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(keyPath, privateKey, { mode: 0o600 });
  return true;
}

async function crxPackage(version) {
  const keyPath = resolveKeyPath();
  mkdirSync(dirname(keyPath), { recursive: true });
  const createdKey = ensureSigningKey(keyPath);
  const crxName = `actions-sidebar-folders-${version}.crx`;
  const crxPath = join(DIST, crxName);
  rmSync(crxPath, { force: true });

  await crx3([join(STAGE, "manifest.json")], {
    keyPath,
    crxPath,
  });

  if (!existsSync(crxPath)) fail(`crx not written: ${crxPath}`);
  return { crxName, crxPath, keyPath, createdKey };
}

async function main() {
  mkdirSync(DIST, { recursive: true });
  copyTree();
  const manifest = writeStoreManifest();
  const { zipName, zipPath } = zipPackage(manifest.version);
  const { crxName, crxPath, keyPath, createdKey } = await crxPackage(
    manifest.version
  );

  console.log("");
  console.log(`Packaged store build → ${zipPath}`);
  console.log(`Packaged CRX         → ${crxPath}`);
  console.log(`  version: ${manifest.version}`);
  console.log(`  host_permissions: ${JSON.stringify(manifest.host_permissions)}`);
  console.log(
    `  (git manifest still includes ${[...DEV_ONLY_HOST_PERMISSIONS].join(", ")} for local debug)`
  );
  console.log(`  signing key: ${keyPath}${createdKey ? " (created)" : ""}`);
  if (createdKey) {
    console.log(
      "  Back up this PEM — losing it changes the extension ID on the next pack."
    );
  }
  console.log("");
  console.log(
    `Upload ${zipName} / ${crxName} to the Chrome Web Store or attach to a GitHub Release.`
  );
  console.log(
    "Note: consumer Chrome usually blocks CRX sideload; zip + Load unpacked remains the reliable path."
  );
  console.log(`Load unpacked for daily work: use the repo root (not dist/).`);
}

main().catch((err) => {
  fail(err?.stack || String(err));
});
