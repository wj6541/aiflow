import fs from "node:fs";
import path from "node:path";

export function writeIfMissing(file, content, writes) {
  if (exists(file)) return false;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, "utf8");
  writes.push(file);
  return true;
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, "utf8");
}

export function writeJson(file, data) {
  writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readText(file) {
  return exists(file) ? fs.readFileSync(file, "utf8") : "";
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(file) {
  return fs.existsSync(file);
}

export function relative(root, file) {
  return normalizePath(path.relative(root, file));
}

export function normalizePath(file) {
  return file.split(path.sep).join("/");
}

export function walkFiles(dir) {
  const results = [];
  if (!exists(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else results.push(full);
  }
  return results;
}
