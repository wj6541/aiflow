import path from "node:path";
import { ensureDir, exists, readText, writeText } from "./fs-utils.js";

export function defaultConfig({ mode, strictness, ui, packageManager }) {
  return {
    version: 1,
    mode,
    strictness,
    ui,
    base_branch: "main",
    package_manager: packageManager,
    roles: { current: "dev" },
    legacy: { level: mode === "legacy" ? "L1" : "L3" },
    checks: {
      require_source: true,
      require_validation: true,
      require_risk: true,
      require_ui_evidence: "auto"
    },
    delivery: {
      require_explicit_release: true,
      require_explicit_archive: true
    },
    role_boundaries: {}
  };
}

export function loadConfig(root) {
  const file = path.join(root, ".aiflow", "config.yaml");
  if (!exists(file)) return { ok: false, error: "Missing .aiflow/config.yaml. Run aiflow init first." };
  const text = readText(file);
  if (!/^version:\s*.+$/m.test(text)) return { ok: false, error: "Unsupported or missing config version." };
  const config = parseConfig(text);
  if (config.version !== "1" && config.version !== 1) return { ok: false, error: "Unsupported or missing config version." };
  return { ok: true, config };
}

export function inspectConfigMigration(root) {
  const file = path.join(root, ".aiflow", "config.yaml");
  if (!exists(file)) return { ok: false, error: "Missing .aiflow/config.yaml. Run aiflow init first." };
  const text = readText(file);
  const loaded = loadConfig(root);
  if (!loaded.ok) return loaded;
  const required = requiredConfigFields(loaded.config);
  let nextText = text;
  const changes = [];

  for (const item of required) {
    const before = nextText;
    nextText = ensureConfigField(nextText, item);
    if (nextText !== before) changes.push(item.path);
  }

  return {
    ok: true,
    changes,
    nextText,
    file
  };
}

export function renderConfig(config) {
  return `version: ${config.version}

mode: ${config.mode}
strictness: ${config.strictness}
ui: ${config.ui}
base_branch: ${config.base_branch}
package_manager: ${config.package_manager}

roles:
  current: ${config.roles.current}

legacy:
  level: ${config.legacy.level}

checks:
  require_source: ${config.checks.require_source}
  require_validation: ${config.checks.require_validation}
  require_risk: ${config.checks.require_risk}
  require_ui_evidence: ${config.checks.require_ui_evidence}

delivery:
  require_explicit_release: ${config.delivery.require_explicit_release}
  require_explicit_archive: ${config.delivery.require_explicit_archive}
`;
}

export function loadState(root) {
  const file = path.join(root, ".aiflow", "state", "current.yaml");
  if (!exists(file)) return {};
  return parseState(readText(file));
}

export function updateState(root, patch) {
  const current = loadState(root);
  const next = { ...current, ...patch };
  ensureDir(path.join(root, ".aiflow", "state"));
  writeText(path.join(root, ".aiflow", "state", "current.yaml"), renderSimpleYaml(next));
}

export function renderSimpleYaml(data) {
  return Object.entries(data).map(([key, val]) => `${key}: ${val}`).join("\n") + "\n";
}

export function parseScalar(value) {
  const trimmed = String(value).trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function requiredConfigFields(config) {
  return [
    { path: "version", key: "version", value: config.version ?? 1 },
    { path: "mode", key: "mode", value: config.mode ?? "new" },
    { path: "strictness", key: "strictness", value: config.strictness ?? "standard" },
    { path: "ui", key: "ui", value: config.ui ?? "auto" },
    { path: "base_branch", key: "base_branch", value: config.base_branch ?? "main" },
    { path: "package_manager", key: "package_manager", value: config.package_manager ?? "unknown" },
    { path: "roles.current", section: "roles", key: "current", value: config.roles?.current ?? "dev" },
    { path: "legacy.level", section: "legacy", key: "level", value: config.legacy?.level ?? "L1" },
    { path: "checks.require_source", section: "checks", key: "require_source", value: config.checks?.require_source ?? true },
    { path: "checks.require_validation", section: "checks", key: "require_validation", value: config.checks?.require_validation ?? true },
    { path: "checks.require_risk", section: "checks", key: "require_risk", value: config.checks?.require_risk ?? true },
    { path: "checks.require_ui_evidence", section: "checks", key: "require_ui_evidence", value: config.checks?.require_ui_evidence ?? "auto" },
    { path: "delivery.require_explicit_release", section: "delivery", key: "require_explicit_release", value: config.delivery?.require_explicit_release ?? true },
    { path: "delivery.require_explicit_archive", section: "delivery", key: "require_explicit_archive", value: config.delivery?.require_explicit_archive ?? true }
  ];
}

function ensureConfigField(text, item) {
  if (!item.section) {
    if (new RegExp(`^${escapeRegex(item.key)}:\\s*`, "m").test(text)) return text;
    return appendLine(text, `${item.key}: ${item.value}`);
  }

  if (!new RegExp(`^${escapeRegex(item.section)}:\\s*$`, "m").test(text)) {
    return appendLine(text, `${item.section}:\n  ${item.key}: ${item.value}`);
  }

  if (hasNestedField(text, item.section, item.key)) return text;
  return insertNestedField(text, item.section, `  ${item.key}: ${item.value}`);
}

function hasNestedField(text, section, key) {
  const block = sectionBlock(text, section);
  return new RegExp(`^\\s+${escapeRegex(key)}:\\s*`, "m").test(block);
}

function insertNestedField(text, section, line) {
  const lines = text.split(/\r?\n/);
  const sectionIndex = lines.findIndex((item) => item.match(new RegExp(`^${escapeRegex(section)}:\\s*$`)));
  if (sectionIndex === -1) return appendLine(text, `${section}:\n${line}`);
  let insertAt = lines.length;
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_]+:\s*/.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  if (insertAt > sectionIndex + 1 && lines[insertAt - 1] === "") insertAt -= 1;
  lines.splice(insertAt, 0, line);
  return lines.join("\n").replace(/\n*$/, "\n");
}

function sectionBlock(text, section) {
  const lines = text.split(/\r?\n/);
  const sectionIndex = lines.findIndex((item) => item.match(new RegExp(`^${escapeRegex(section)}:\\s*$`)));
  if (sectionIndex === -1) return "";
  const block = [];
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_]+:\s*/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join("\n");
}

function appendLine(text, line) {
  return `${text.replace(/\s*$/, "\n\n")}${line}\n`;
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseConfig(text) {
  const config = defaultConfig({
    mode: "new",
    strictness: "standard",
    ui: "auto",
    packageManager: "unknown"
  });
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    if (!line.trim()) continue;
    const rootMatch = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    const nestedMatch = line.match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (rootMatch) {
      const [, key, val] = rootMatch;
      if (val === "") {
        section = key;
      } else {
        config[key] = parseScalar(val);
        section = "";
      }
    } else if (nestedMatch && section) {
      const [, key, val] = nestedMatch;
      config[section] ??= {};
      config[section][key] = parseScalar(val);
    }
  }
  config.role_boundaries = parseRoleBoundaries(text);
  return config;
}

function parseRoleBoundaries(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  let inBoundaries = false;
  let currentRole = "";
  let collectingAllow = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");
    if (!line.trim()) continue;

    const rootMatch = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (rootMatch) {
      inBoundaries = rootMatch[1] === "role_boundaries" && rootMatch[2] === "";
      currentRole = "";
      collectingAllow = false;
      continue;
    }
    if (!inBoundaries) continue;

    const roleMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
    if (roleMatch) {
      currentRole = roleMatch[1];
      result[currentRole] ??= { allow: [], mode: "append" };
      collectingAllow = false;
      continue;
    }
    if (!currentRole) continue;

    const fieldMatch = line.match(/^\s{4}([A-Za-z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, val] = fieldMatch;
      collectingAllow = key === "allow" && val === "";
      if (key === "allow" && val) {
        result[currentRole].allow.push(...parseAllowList(val));
      } else if (key === "mode" || key === "strategy") {
        result[currentRole].mode = String(parseScalar(val)).toLowerCase();
      } else if (key === "override" || key === "replace") {
        if (parseScalar(val) === true) result[currentRole].mode = "override";
      }
      continue;
    }

    const allowItem = line.match(/^\s{6}-\s*(.+)$/);
    if (collectingAllow && allowItem) {
      result[currentRole].allow.push(stripQuotes(allowItem[1].trim()));
    }
  }

  for (const value of Object.values(result)) {
    value.allow = [...new Set(value.allow.map(stripQuotes).filter(Boolean))];
    if (value.mode !== "override") value.mode = "append";
  }
  return result;
}

function parseAllowList(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  const inline = trimmed.match(/^\[(.*)\]$/);
  const body = inline ? inline[1] : trimmed;
  return body.split(",").map((item) => stripQuotes(item.trim())).filter(Boolean);
}

function stripQuotes(value) {
  return String(value).replace(/^["']|["']$/g, "");
}

function parseState(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (match) result[match[1]] = parseScalar(match[2]);
  }
  return result;
}
