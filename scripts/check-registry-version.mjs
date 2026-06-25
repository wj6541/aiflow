import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages", "cli", "package.json"), "utf8"));
const spec = `${pkg.name}@${pkg.version}`;
const cacheDir = path.join(root, ".npm-cache");

const result = spawnSync("npm", [
  "view",
  spec,
  "version",
  "--json",
  "--cache",
  cacheDir
], {
  cwd: root,
  encoding: "utf8"
});

const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();

if (result.status === 0) {
  const version = parseNpmViewVersion(result.stdout);
  if (version) {
    console.error(`Package version already exists on npm: ${spec}`);
    process.exitCode = 1;
  } else {
    console.log(`Package version is available on npm: ${spec}`);
  }
} else if (isMissingVersion(output)) {
  console.log(`Package version is available on npm: ${spec}`);
} else {
  console.error(`Unable to verify npm package version for ${spec}`);
  if (output) console.error(output);
  process.exitCode = result.status || 1;
}

function parseNpmViewVersion(stdout) {
  const text = String(stdout || "").trim();
  if (!text || text === "null") return "";
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}

function isMissingVersion(text) {
  return /E404|404\s+Not Found|No match found|not in this registry/i.test(String(text || ""));
}
