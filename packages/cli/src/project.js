import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { exists, normalizePath, readText, relative, walkFiles } from "./fs-utils.js";

export function detectPackageManager(root) {
  if (exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(path.join(root, "package-lock.json"))) return "npm";
  if (exists(path.join(root, "yarn.lock"))) return "yarn";
  if (exists(path.join(root, "bun.lockb")) || exists(path.join(root, "bun.lock"))) return "bun";
  const declared = packageManagerFromPackageJson(root);
  if (declared) return declared;
  if (exists(path.join(root, "package.json"))) return "npm";
  return "unknown";
}

export function detectWorkspace(root) {
  const files = [];
  if (exists(path.join(root, "pnpm-workspace.yaml"))) files.push("pnpm-workspace.yaml");
  if (exists(path.join(root, "lerna.json"))) files.push("lerna.json");
  if (exists(path.join(root, "turbo.json"))) files.push("turbo.json");
  const pkg = readPackageJson(root);
  if (pkg?.workspaces) files.push("package.json#workspaces");
  const packages = detectWorkspacePackages(root);
  return {
    type: files.length ? "monorepo" : "single-package",
    files,
    packages
  };
}

export function detectWorkspacePackages(root) {
  const patterns = workspacePatterns(root);
  const packages = new Set();
  for (const pattern of patterns) {
    for (const dir of expandWorkspacePattern(root, pattern)) {
      if (exists(path.join(root, dir, "package.json"))) packages.add(dir);
    }
  }
  return [...packages].sort();
}

export function touchedWorkspacePackages(root, files) {
  const packages = detectWorkspacePackages(root);
  const touched = new Set();
  for (const file of files) {
    const normalized = normalizePath(file);
    for (const pkg of packages) {
      if (normalized === pkg || normalized.startsWith(`${pkg}/`)) touched.add(pkg);
    }
  }
  return [...touched].sort();
}

export function detectCi(root) {
  const providers = [];
  const githubWorkflows = path.join(root, ".github", "workflows");
  if (exists(githubWorkflows)) {
    const files = fs.readdirSync(githubWorkflows).filter((file) => /\.ya?ml$/i.test(file));
    if (files.length) providers.push("github-actions");
  }
  if (exists(path.join(root, ".gitlab-ci.yml"))) providers.push("gitlab-ci");
  if (exists(path.join(root, "azure-pipelines.yml"))) providers.push("azure-pipelines");
  if (exists(path.join(root, ".circleci", "config.yml"))) providers.push("circleci");
  if (exists(path.join(root, "bitbucket-pipelines.yml"))) providers.push("bitbucket-pipelines");
  return providers;
}

export function detectTechStack(root) {
  const stack = new Set();
  const pkg = readPackageJson(root);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasDep = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  if (hasDep("next")) stack.add("nextjs");
  if (hasDep("vite")) stack.add("vite");
  if (hasDep("react")) stack.add("react");
  if (hasDep("vue")) stack.add("vue");
  if (hasDep("svelte")) stack.add("svelte");
  if (hasDep("@angular/core")) stack.add("angular");
  if (hasDep("@nestjs/core")) stack.add("nestjs");
  if (hasDep("express")) stack.add("express");
  if (hasDep("fastify")) stack.add("fastify");
  if (hasDep("typescript")) stack.add("typescript");
  if (hasDep("tailwindcss")) stack.add("tailwindcss");
  if (hasDep("vitest")) stack.add("vitest");
  if (hasDep("jest")) stack.add("jest");
  if (hasDep("@playwright/test") || hasDep("playwright")) stack.add("playwright");
  if (exists(path.join(root, "pom.xml"))) stack.add("maven");
  if (exists(path.join(root, "build.gradle")) || exists(path.join(root, "build.gradle.kts"))) stack.add("gradle");
  if (exists(path.join(root, "go.mod"))) stack.add("go");
  return [...stack];
}

export function detectCommands(scripts) {
  return {
    lint: firstScript(scripts, ["lint"]),
    typecheck: firstScript(scripts, ["typecheck", "type-check", "tsc"]),
    test: firstScript(scripts, ["test"]),
    build: firstScript(scripts, ["build"])
  };
}

export function readPackageJson(root) {
  const file = path.join(root, "package.json");
  if (!exists(file)) return null;
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function workspacePatterns(root) {
  const patterns = [];
  const pkg = readPackageJson(root);
  if (Array.isArray(pkg?.workspaces)) patterns.push(...pkg.workspaces);
  if (Array.isArray(pkg?.workspaces?.packages)) patterns.push(...pkg.workspaces.packages);
  const pnpm = readText(path.join(root, "pnpm-workspace.yaml"));
  for (const match of pnpm.matchAll(/^\s*-\s+['"]?([^'"\n]+)['"]?\s*$/gm)) {
    patterns.push(match[1].trim());
  }
  return [...new Set(patterns)].filter((item) => item && !item.startsWith("!"));
}

function packageManagerFromPackageJson(root) {
  const pkg = readPackageJson(root);
  const value = typeof pkg?.packageManager === "string" ? pkg.packageManager.toLowerCase() : "";
  if (value.startsWith("pnpm@")) return "pnpm";
  if (value.startsWith("npm@")) return "npm";
  if (value.startsWith("yarn@")) return "yarn";
  if (value.startsWith("bun@")) return "bun";
  return "";
}

function expandWorkspacePattern(root, pattern) {
  const normalized = normalizePath(pattern).replace(/\/+$/, "");
  if (!normalized.includes("*")) return exists(path.join(root, normalized)) ? [normalized] : [];
  const starIndex = normalized.indexOf("*");
  const base = normalized.slice(0, starIndex).replace(/\/+$/, "");
  const suffix = normalized.slice(starIndex + 1).replace(/^\/+/, "");
  const baseDir = path.join(root, base);
  if (!exists(baseDir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = normalizePath(path.join(base, entry.name, suffix));
    results.push(candidate.replace(/\/+$/, ""));
  }
  return results;
}

function firstScript(scripts, names) {
  for (const name of names) {
    if (scripts?.[name]) return { name, command: scripts[name] };
  }
  return null;
}

export function detectAiRules(root) {
  const candidates = [
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    ".cursor/rules"
  ];
  return candidates.filter((item) => exists(path.join(root, item)));
}

export function inspectOpenSpec(root) {
  const issues = [];
  const base = path.join(root, "openspec");
  if (!exists(base)) return { compatible: false, issues: ["missing openspec/"] };
  if (!exists(path.join(base, "changes"))) issues.push("missing openspec/changes/");
  if (!exists(path.join(base, "specs"))) issues.push("missing openspec/specs/");

  const changesDir = path.join(base, "changes");
  if (exists(changesDir)) {
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(changesDir, entry.name);
      for (const required of ["proposal.md", "design.md", "tasks.md"]) {
        if (!exists(path.join(dir, required))) issues.push(`${entry.name}: missing ${required}`);
      }
      const legacyRoleDirs = ["pm-", "architect-", "dev-", "qa-", "release-"].some((prefix) => entry.name.startsWith(prefix));
      if (legacyRoleDirs) issues.push(`${entry.name}: role-prefixed change detected; aiflow uses one business change per topic`);
    }
  }
  return { compatible: issues.length === 0, issues };
}

export function inspectRuleConflicts(root) {
  const conflicts = [];
  const agents = readText(path.join(root, "AGENTS.md"));
  if (agents && /always archive|auto archive|automatically archive/i.test(agents)) {
    conflicts.push("AGENTS.md may allow automatic archive; aiflow requires explicit archive");
  }
  if (agents && /auto merge|automatically merge/i.test(agents)) {
    conflicts.push("AGENTS.md may allow automatic merge; aiflow requires explicit delivery");
  }
  const cursorRules = path.join(root, ".cursor", "rules");
  if (exists(cursorRules)) {
    for (const file of walkFiles(cursorRules)) {
      const text = readText(file);
      if (/auto archive|automatically archive|auto merge|automatically merge/i.test(text)) {
        conflicts.push(`${relative(root, file)} may conflict with explicit delivery/archive`);
      }
    }
  }
  return conflicts;
}

export function hasPlaywright(root) {
  const pkg = readPackageJson(root);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return Boolean(deps["@playwright/test"] || deps.playwright || exists(path.join(root, "playwright.config.ts")) || exists(path.join(root, "playwright.config.js")));
}

export function isGitRepo(root) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "true";
}

export function gitLines(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(normalizePath);
}

export function gitLinesResult(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    return {
      ok: false,
      files: [],
      error: (result.stderr || result.stdout || "git command failed").trim()
    };
  }
  return {
    ok: true,
    files: result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(normalizePath),
    error: ""
  };
}

export function currentCommit(root) {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}
