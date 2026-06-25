import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, readText, relative, writeText } from "./fs-utils.js";
import { currentCommit } from "./project.js";

export function appendEvidence({ root, context, type = "validation", source = "manual", status = "passed", command = "", artifacts = [], note = "" }) {
  const file = evidencePath(context.changeDir);
  ensureDir(path.dirname(file));
  if (!exists(file)) writeText(file, "# Evidence\n\n");
  const id = `ev-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const block = `- id: ${id}
  type: ${singleLine(type)}
  source: ${singleLine(source)}
  status: ${singleLine(status)}
  command: ${singleLine(command)}
  artifacts:
${artifacts.length ? artifacts.map((item) => `    - ${singleLine(recordArtifact(root, item))}`).join("\n") : "    - none"}
  note: ${singleLine(note)}
  recorded_by: ${singleLine(process.env.USER || process.env.USERNAME || "unknown")}
  recorded_at: ${new Date().toISOString()}
  commit: ${singleLine(currentCommit(root) || "unknown")}
`;
  fs.appendFileSync(file, `${block}\n`, "utf8");
  return { file, id };
}

export function listEvidence({ context }) {
  const file = evidencePath(context.changeDir);
  if (!exists(file)) return { file, text: "No evidence recorded.\n" };
  return { file, text: readText(file) };
}

export function readEvidenceSummary(changeDir, root = "") {
  const text = readText(evidencePath(changeDir));
  if (!text.trim()) return { exists: false, failed: false, passed: false };
  const entries = parseEvidenceEntries(text).filter((entry) => entry.type === "validation");
  return {
    exists: entries.length > 0,
    failed: entries.some((entry) => entry.status === "failed"),
    passed: entries.some((entry) => entry.status === "passed" && hasLinkedArtifact(entry, root))
  };
}

function evidencePath(changeDir) {
  return path.join(changeDir, "evidence.yaml");
}

function singleLine(value) {
  const text = String(value || "").replace(/\r?\n/g, " ").trim();
  return text || "none";
}

function recordArtifact(root, value) {
  const text = String(value || "").trim();
  if (isUrl(text)) return text;
  return relative(root, path.resolve(root, text));
}

function parseEvidenceEntries(text) {
  const entries = [];
  let current = null;
  let inArtifacts = false;

  for (const raw of String(text || "").split(/\r?\n/)) {
    const idMatch = raw.match(/^\s*-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: idMatch[1].trim(), artifacts: [] };
      entries.push(current);
      inArtifacts = false;
      continue;
    }
    if (!current) continue;

    const fieldMatch = raw.match(/^\s{2}([A-Za-z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, val] = fieldMatch;
      inArtifacts = key === "artifacts";
      if (!inArtifacts) current[key] = normalizeScalar(key, val);
      continue;
    }

    if (inArtifacts) {
      const artifactMatch = raw.match(/^\s{4}-\s*(.+)$/);
      if (artifactMatch) current.artifacts.push(String(artifactMatch[1] || "").trim());
    }
  }

  return entries;
}

function normalizeScalar(key, value) {
  const text = String(value || "").trim();
  return ["type", "source", "status"].includes(key) ? text.toLowerCase() : text;
}

function hasLinkedArtifact(entry, root) {
  return Array.isArray(entry.artifacts) && entry.artifacts.some((artifact) => {
    const value = String(artifact || "").trim();
    if (!value || value.toLowerCase() === "none") return false;
    if (isUrl(value)) return true;
    if (!root) return true;
    const file = path.isAbsolute(value) ? value : path.resolve(root, value);
    return exists(file);
  });
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}
