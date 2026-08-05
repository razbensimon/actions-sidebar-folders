#!/usr/bin/env node
/**
 * Local debug log sink for Actions Sidebar Folders.
 * Content script POSTs JSON lines here when Debug mode is on.
 *
 *   pnpm dev:logs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG_FILE = path.join(ROOT, ".asf-debug.log");
const HOST = "127.0.0.1";
const PORT = 3927;

function stamp() {
  return new Date().toISOString();
}

function lineFromBody(raw) {
  try {
    const data = JSON.parse(raw);
    const level = data.level || "log";
    const args = Array.isArray(data.args) ? data.args : [data];
    const rendered = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    return `${data.ts || stamp()} [${level}] ${rendered}`;
  } catch {
    return `${stamp()} [raw] ${raw}`;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && (req.url === "/log" || req.url === "/")) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const line = lineFromBody(raw);
      fs.appendFileSync(LOG_FILE, line + "\n");
      console.log(line);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, HOST, () => {
  console.log(`[asf-log] listening http://${HOST}:${PORT}`);
  console.log(`[asf-log] writing ${LOG_FILE}`);
  console.log(`[asf-log] enable Debug mode in extension options, reload, refresh Actions`);
});
