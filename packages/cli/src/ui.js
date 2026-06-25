import path from "node:path";
import { spawnSync } from "node:child_process";
import { EXIT, VIEWPORTS } from "./constants.js";
import { ensureDir, exists, readText, writeIfMissing, writeJson, writeText } from "./fs-utils.js";
import { hasPlaywright } from "./project.js";
import { readUiMetadata } from "./check.js";

export function uiClassify(context) {
  return readUiMetadata(context.changeDir);
}

export function addUiDeviation({ root, context, description, reason, acceptedBy }) {
  if (!description) {
    return { code: EXIT.CONFIG_ERROR, error: "Usage: aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]\n" };
  }
  if (!reason) {
    return { code: EXIT.CONFIG_ERROR, error: "Missing --reason for known deviation.\n" };
  }

  const by = acceptedBy || process.env.USER || process.env.USERNAME || "unknown";
  const acceptedAt = new Date().toISOString();
  const entry = renderDeviationEntry({
    description,
    reason,
    acceptedBy: by,
    acceptedAt
  });
  const deviationsPath = path.join(root, ".aiflow", "artifacts", "ui", "known-deviations.md");
  ensureDir(path.dirname(deviationsPath));
  if (!exists(deviationsPath)) writeText(deviationsPath, "# Known Deviations\n\n");
  appendText(deviationsPath, entry);

  const visualPath = path.join(context.changeDir, "visual-validation.md");
  if (!exists(visualPath)) writeText(visualPath, renderVisualValidation(readUiMetadata(context.changeDir)));
  appendText(visualPath, entry);

  return {
    code: EXIT.PASS,
    message: `✓ UI deviation recorded: ${description}\n`
  };
}

export function listUiDeviations({ root }) {
  const deviationsPath = path.join(root, ".aiflow", "artifacts", "ui", "known-deviations.md");
  if (!exists(deviationsPath)) {
    return { code: EXIT.PASS, message: "No UI deviations recorded.\n" };
  }
  return { code: EXIT.PASS, message: readText(deviationsPath) };
}

export function uiVerify({ root, context, url }) {
  const ui = readUiMetadata(context.changeDir);
  ensureDir(path.join(root, ".aiflow", "artifacts", "screenshots"));
  ensureDir(path.join(root, ".aiflow", "artifacts", "ui"));

  const briefPath = path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md");
  if (ui.ui_source === "none" || ui.ui_source === "text_spec") {
    writeIfMissing(briefPath, templateUiBrief(), []);
  }

  const consolePath = path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json");
  const responsivePath = path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json");

  writeJson(consolePath, {
    result: "not_run",
    errors: [],
    reason: "Playwright integration is not configured yet."
  });
  writeJson(responsivePath, {
    result: "not_run",
    viewports: ui.viewports.length ? ui.viewports : ["desktop", "tablet", "mobile"],
    reason: "Playwright integration is not configured yet."
  });
  writeIfMissing(path.join(root, ".aiflow", "artifacts", "ui", "known-deviations.md"), "# Known Deviations\n\n", []);

  writeText(path.join(context.changeDir, "visual-validation.md"), renderVisualValidation(ui));

  if (!hasPlaywright(root)) {
    return {
      code: EXIT.MISSING_DEPENDENCY,
      message: [
        "UI evidence files created.",
        "Playwright is not installed or configured, so browser screenshots were not captured.",
        "Next: configure Playwright, then run aiflow ui verify again."
      ].join("\n") + "\n"
    };
  }

  const runnerPath = path.join(root, ".aiflow", "artifacts", "ui", "playwright-runner.mjs");
  writeText(runnerPath, playwrightRunnerSource());

  if (!url) {
    return {
      code: EXIT.PASS,
      message: [
        "UI evidence files created.",
        "Playwright was detected.",
        "No --url was provided, so browser screenshots were not captured.",
        "Next: aiflow ui verify --url http://localhost:3000"
      ].join("\n") + "\n"
    };
  }

  const run = spawnSync(process.execPath, [
    runnerPath,
    url,
    path.join(root, ".aiflow", "artifacts", "screenshots"),
    consolePath,
    responsivePath,
    JSON.stringify(ui.viewports.length ? ui.viewports : ["desktop", "tablet", "mobile"])
  ], { cwd: root, encoding: "utf8" });

  if (run.status !== 0) {
    return {
      code: EXIT.CHECK_FAILED,
      error: run.stderr || run.stdout || "Playwright UI verification failed.\n"
    };
  }

  writeText(path.join(context.changeDir, "visual-validation.md"), `${renderVisualValidation(ui)}
## Browser Run

- url: ${url}
- screenshots: .aiflow/artifacts/screenshots/
- console_errors: .aiflow/artifacts/ui/console-errors.json
- responsive: .aiflow/artifacts/ui/responsive-check.json
`);

  return { code: EXIT.PASS, message: "✓ UI validation artifacts recorded.\n" };
}

export function renderVisualValidation(ui) {
  return `# Visual Validation

ui_source: ${ui.ui_source}
ui_target: ${ui.ui_target}
routes:
${(ui.routes.length ? ui.routes : ["/"]).map((route) => `  - path: ${route}`).join("\n")}
viewports:
${(ui.viewports.length ? ui.viewports : ["desktop", "tablet", "mobile"]).map((item) => `  - ${item}`).join("\n")}
console_errors: pass | fail | not_run
responsive: pass | fail | not_run

## Known Deviations

- description:
  reason:
  accepted_by:
  accepted_at:

## Notes

CLI records evidence and risk. Human reviewers decide whether visual deviations are acceptable.
`;
}

function appendText(file, content) {
  writeText(file, readText(file) + content);
}

function renderDeviationEntry({ description, reason, acceptedBy, acceptedAt }) {
  return `## Deviation

- description: ${description}
- reason: ${reason}
- accepted_by: ${acceptedBy}
- accepted_at: ${acceptedAt}

`;
}

function playwrightRunnerSource() {
  return `import fs from "node:fs";
import path from "node:path";
const { chromium } = await loadPlaywright();

const [url, screenshotsDir, consolePath, responsivePath, viewportsJson] = process.argv.slice(2);
const viewports = JSON.parse(viewportsJson || "[\\"desktop\\",\\"tablet\\",\\"mobile\\"]");
const sizes = ${JSON.stringify(VIEWPORTS, null, 2)};
const errors = [];
const responsive = [];

fs.mkdirSync(screenshotsDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const name of viewports) {
    const viewport = sizes[name] || sizes.desktop;
    const page = await browser.newPage({ viewport });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push({ viewport: name, text: msg.text() });
    });
    page.on("pageerror", (error) => {
      errors.push({ viewport: name, text: error.message });
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotsDir, name + ".png"), fullPage: true });
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    responsive.push({ viewport: name, pass: !overflow, horizontalOverflow: overflow });
    await page.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(consolePath, JSON.stringify({ result: errors.length ? "fail" : "pass", errors }, null, 2) + "\\n");
fs.writeFileSync(responsivePath, JSON.stringify({ result: responsive.every((item) => item.pass) ? "pass" : "fail", viewports: responsive }, null, 2) + "\\n");
if (errors.length || responsive.some((item) => !item.pass)) process.exitCode = 1;

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (primaryError) {
    try {
      return await import("@playwright/test");
    } catch {
      throw primaryError;
    }
  }
}
`;
}

function templateUiBrief() {
  return `# UI Brief

## Goal

TODO

## Users

TODO

## Layout

TODO

## Key States

TODO

## Style Source

TODO

## Acceptance

TODO
`;
}
