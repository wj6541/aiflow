import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aiflow-package-smoke-"));
const packDir = path.join(temp, "pack");
const consumerDir = path.join(temp, "consumer");
const cacheDir = path.join(temp, "npm-cache");
const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, "packages", "cli", "package.json"), "utf8")).version;

try {
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(consumerDir, { recursive: true });
  fs.writeFileSync(path.join(consumerDir, "package.json"), JSON.stringify({ private: true }, null, 2));

  const pack = run("npm", [
    "pack",
    "--workspace",
    "packages/cli",
    "--pack-destination",
    packDir,
    "--cache",
    cacheDir,
    "--ignore-scripts",
    "--json"
  ], root);
  const tarball = JSON.parse(pack.stdout)[0]?.filename;
  if (!tarball) throw new Error("npm pack did not return a tarball filename");

  const tarballPath = path.join(packDir, tarball);
  run("npm", [
    "install",
    tarballPath,
    "--cache",
    cacheDir,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund"
  ], consumerDir);

  const bin = path.join(consumerDir, "node_modules", ".bin", process.platform === "win32" ? "aiflow.cmd" : "aiflow");
  const version = run(bin, ["--version"], consumerDir).stdout.trim();
  if (version !== expectedVersion) throw new Error(`Expected version ${expectedVersion}, got ${version}`);
  const versionCommand = run(bin, ["version"], consumerDir).stdout.trim();
  if (versionCommand !== expectedVersion) throw new Error(`Expected version command ${expectedVersion}, got ${versionCommand}`);
  const help = run(bin, ["help"], consumerDir).stdout;
  if (!help.includes("aiflow init")) throw new Error("Installed help output does not include init command");

  run(bin, ["init", "--mode", "legacy"], consumerDir);
  assertExists(path.join(consumerDir, ".aiflow", "config.yaml"));
  assertExists(path.join(consumerDir, "openspec", "changes"));

  console.log("Package smoke passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result;
}

function assertExists(file) {
  if (!fs.existsSync(file)) throw new Error(`Expected file to exist: ${file}`);
}
