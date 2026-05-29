import path from "node:path";
import { spawnSync } from "node:child_process";
import { EXIT } from "./constants.js";
import { ensureDir, exists, readText, relative, writeText } from "./fs-utils.js";
import { hasPlaywright } from "./project.js";

const PLACEHOLDER_PATTERN = /\{\{.*?\}\}|TODO|TBD|待补充|在这里粘贴/i;

export function writeAiTestBasePrompt({ root }) {
  const outPath = basePromptPath(root);
  writeText(outPath, aiTestBasePrompt());
  return {
    code: EXIT.PASS,
    message: `✓ AI test base prompt written.\n- ${relative(root, outPath)}\n`
  };
}

export async function generateAiTestScenarios({ root, context, sources = {}, out = "", ai = false, apiUrl = "", apiKey = "", model = "" }) {
  const testsDir = path.join(root, ".aiflow", "artifacts", "tests");
  ensureDir(testsDir);
  const basePath = basePromptPath(root);
  writeText(basePath, aiTestBasePrompt());

  const input = collectScenarioInput({ root, context, sources });
  const missingInfo = missingInput(input);
  const promptPath = path.join(testsDir, `${context.state.active_change}-test-generation-prompt.md`);
  const scenarioPath = out
    ? path.resolve(root, out)
    : path.join(context.changeDir, "test-scenarios.yaml");

  writeText(promptPath, renderGenerationPrompt({ context, input, missingInfo }));

  const blocked = missingInfo.length > 0;
  if (blocked || !ai) {
    writeText(scenarioPath, renderScenarioYaml({ context, input, missingInfo }));
  }

  if (blocked) {
    return {
      code: EXIT.CHECK_FAILED,
      message: [
        "AI test scenario generation input is incomplete.",
        `- base_prompt: ${relative(root, basePath)}`,
        `- generation_prompt: ${relative(root, promptPath)}`,
        `- scenarios: ${relative(root, scenarioPath)}`,
        `- missing_info: ${missingInfo.join(", ")}`
      ].join("\n") + "\n"
    };
  }

  if (ai) {
    const aiResult = await requestAiScenarios({
      prompt: readText(promptPath),
      apiUrl: apiUrl || process.env.AIFLOW_AI_API_URL || "https://api.openai.com/v1/responses",
      apiKey: apiKey || process.env.AIFLOW_AI_API_KEY || process.env.OPENAI_API_KEY || "",
      model: model || process.env.AIFLOW_AI_MODEL || "gpt-4.1-mini"
    });

    if (!aiResult.ok) {
      writeText(scenarioPath, renderScenarioYaml({ context, input, missingInfo: ["ai_generation_failed"] }));
      return {
        code: aiResult.code,
        error: `${aiResult.error}\n`
      };
    }

    const rawPath = path.join(testsDir, `${context.state.active_change}-ai-response.md`);
    writeText(rawPath, aiResult.rawText);
    writeText(scenarioPath, aiResult.yaml);

    return {
      code: EXIT.PASS,
      message: [
        "AI test scenarios generated and waiting for human review.",
        `- base_prompt: ${relative(root, basePath)}`,
        `- generation_prompt: ${relative(root, promptPath)}`,
        `- ai_response: ${relative(root, rawPath)}`,
        `- scenarios: ${relative(root, scenarioPath)}`,
        "- human_review_required: true",
        "- next: aiflow test approve"
      ].join("\n") + "\n"
    };
  }

  return {
    code: EXIT.PASS,
    message: [
      "AI test scenario generation package is ready for human review.",
      `- base_prompt: ${relative(root, basePath)}`,
      `- generation_prompt: ${relative(root, promptPath)}`,
      `- scenarios: ${relative(root, scenarioPath)}`,
      "- human_review_required: true",
      "- next: aiflow test generate --ai"
    ].join("\n") + "\n"
  };
}

export function runTestScenarios({ root, context, url, scenarioFile = "", reviewed = false }) {
  if (!url) {
    return { code: EXIT.CONFIG_ERROR, error: "Usage: aiflow test run --url <base-url> [--scenario file] [--reviewed]\n" };
  }

  const testsDir = path.join(root, ".aiflow", "artifacts", "tests");
  ensureDir(testsDir);
  const scenarioPath = scenarioFile ? path.resolve(root, scenarioFile) : path.join(context.changeDir, "test-scenarios.yaml");
  const scenarioText = readText(scenarioPath);
  if (!scenarioText.trim()) {
    return { code: EXIT.CONFIG_ERROR, error: `Scenario file not found or empty: ${relative(root, scenarioPath)}\n` };
  }

  const reviewGate = validateHumanReviewGate(scenarioText);
  if (!reviewGate.ok) {
    return {
      code: EXIT.UNSAFE_OPERATION,
      error: `${reviewGate.error}\n`
    };
  }

  if (requiresHumanReview(scenarioText) && !reviewed && !hasTestScenarioApproval(context)) {
    return {
      code: EXIT.UNSAFE_OPERATION,
      error: [
        "Scenario run blocked: AI generated scenarios require explicit human review.",
        "Next: review the scenario file, then run aiflow test approve or pass --reviewed for this run."
      ].join("\n") + "\n"
    };
  }

  const safety = validateScenarioSafety(scenarioText);
  if (!safety.ok) {
    return {
      code: EXIT.UNSAFE_OPERATION,
      error: `Scenario run blocked: ${safety.error}\n`
    };
  }

  const runnerPath = path.join(testsDir, "playwright-scenario-runner.mjs");
  const resultsPath = path.join(testsDir, "scenario-results.json");
  const screenshotsDir = path.join(testsDir, "screenshots");
  writeText(runnerPath, playwrightScenarioRunnerSource());

  if (!hasPlaywright(root)) {
    writeText(resultsPath, `${JSON.stringify({
      result: "not_run",
      reason: "Playwright is not installed or configured.",
      scenarios: []
    }, null, 2)}\n`);
    return {
      code: EXIT.MISSING_DEPENDENCY,
      message: [
        "Test scenario runner created.",
        "Playwright is not installed or configured, so scenarios were not executed.",
        `- runner: ${relative(root, runnerPath)}`,
        `- results: ${relative(root, resultsPath)}`
      ].join("\n") + "\n"
    };
  }

  const run = spawnSync(process.execPath, [
    runnerPath,
    scenarioPath,
    url,
    resultsPath,
    screenshotsDir
  ], { cwd: root, encoding: "utf8" });

  if (run.status !== 0) {
    return {
      code: EXIT.CHECK_FAILED,
      error: run.stderr || run.stdout || "Playwright scenario run failed.\n"
    };
  }

  return {
    code: EXIT.PASS,
    message: [
      "✓ Test scenarios executed.",
      `- results: ${relative(root, resultsPath)}`,
      `- screenshots: ${relative(root, screenshotsDir)}`
    ].join("\n") + "\n"
  };
}

export function requiresHumanReview(scenarioText) {
  return scenarioText.includes("source: ai_generated");
}

function hasTestScenarioApproval(context) {
  return readText(path.join(context.changeDir, "approvals.md")).includes("Test Scenario Approval");
}

function collectScenarioInput({ root, context, sources }) {
  return {
    requirement: readSource(root, sources.requirements, [
      path.join(context.changeDir, "proposal.md"),
      path.join(context.changeDir, "pm.md"),
      path.join(context.changeDir, "tasks.md")
    ]),
    page: readSource(root, sources.page, [
      path.join(context.changeDir, "ui.md"),
      path.join(context.changeDir, "visual-validation.md")
    ]),
    uiBrief: readSource(root, sources.uiBrief, [
      path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md"),
      path.join(context.changeDir, "ui.md")
    ]),
    constraints: readSource(root, sources.constraints, [
      path.join(context.changeDir, "qa.md"),
      path.join(root, "TOOLS.md"),
      path.join(root, "docs", "project-profile.md")
    ])
  };
}

function readSource(root, explicitFile, fallbackFiles) {
  const files = explicitFile ? [path.resolve(root, explicitFile)] : fallbackFiles;
  const sections = [];
  for (const file of files) {
    if (!exists(file)) continue;
    const text = readText(file).trim();
    if (!text) continue;
    sections.push(`### ${relative(root, file)}\n\n${text}`);
  }
  return sections.join("\n\n");
}

function missingInput(input) {
  const required = [
    ["requirement_or_user_story", input.requirement],
    ["page_routes_or_dom_summary", input.page],
    ["ui_brief_or_acceptance_criteria", input.uiBrief],
    ["existing_tests_or_constraints", input.constraints]
  ];
  return required
    .filter(([, text]) => !hasConcreteContent(text))
    .map(([name]) => name);
}

function hasConcreteContent(text) {
  const cleaned = String(text || "").replace(/^#.*$/gm, "").trim();
  return Boolean(cleaned) && !PLACEHOLDER_PATTERN.test(cleaned);
}

function renderGenerationPrompt({ context, input, missingInfo }) {
  return `# AI Test Scenario Generation Request

change: ${context.state.active_change}
source: ai_generated
human_review_required: true
status: ${missingInfo.length ? "blocked_by_missing_input" : "ready_for_ai_generation"}

${aiTestBasePrompt()}

## Input

### Requirement / Change Description

${input.requirement || "MISSING"}

### Page / Route Information

${input.page || "MISSING"}

### UI Brief / Acceptance Criteria

${input.uiBrief || "MISSING"}

### Existing Tests / Constraints

${input.constraints || "MISSING"}

## Missing Info

${missingInfo.length ? missingInfo.map((item) => `- ${item}`).join("\n") : "- none"}
`;
}

function renderScenarioYaml({ context, missingInfo }) {
  const status = missingInfo.length ? "blocked_by_missing_input" : "ready_for_ai_generation";
  return `source: ai_generated
human_review_required: true
change: ${context.state.active_change}
status: ${status}
missing_info:
${missingInfo.length ? missingInfo.map((item) => `  - ${item}`).join("\n") : "  - none"}
assumptions:
  - No page flow is assumed unless it is present in the provided requirement, route, UI brief, or constraints.
  - Prefer role, label, text, placeholder, and accessible name selectors before CSS selectors.
  - Generated scenarios must be reviewed by a human before CI enforcement.
scenarios: []
`;
}

async function requestAiScenarios({ prompt, apiUrl, apiKey, model }) {
  if (apiUrl.includes("api.openai.com") && !apiKey) {
    return {
      ok: false,
      code: EXIT.CONFIG_ERROR,
      error: "Missing AI API key. Set OPENAI_API_KEY or AIFLOW_AI_API_KEY, or pass --ai-url for a compatible local endpoint."
    };
  }

  let response;
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2
      })
    });
  } catch (error) {
    return {
      ok: false,
      code: EXIT.CHECK_FAILED,
      error: `AI scenario generation request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: EXIT.CHECK_FAILED,
      error: `AI scenario generation failed with HTTP ${response.status}: ${body}`
    };
  }

  let rawText = body;
  try {
    const json = JSON.parse(body);
    rawText = json.output_text
      || json.choices?.[0]?.message?.content
      || json.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n")
      || body;
  } catch {
    rawText = body;
  }

  const yaml = extractYaml(rawText);
  const validation = validateAiScenarioYaml(yaml);
  if (!validation.ok) {
    return {
      ok: false,
      code: EXIT.CHECK_FAILED,
      error: `AI scenario output failed validation: ${validation.error}`
    };
  }

  return { ok: true, rawText, yaml: ensureTrailingNewline(yaml) };
}

function extractYaml(text) {
  const fenced = String(text).match(/```ya?ml\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function validateAiScenarioYaml(yaml) {
  if (!/scenarios:\s*\n\s*-/m.test(yaml)) return { ok: false, error: "missing non-empty scenarios list" };
  if (!/source:\s*ai_generated\b/.test(yaml)) return { ok: false, error: "missing source: ai_generated" };
  if (!/human_review_required:\s*true\b/.test(yaml)) return { ok: false, error: "missing human_review_required: true" };
  return validateScenarioSafety(yaml);
}

function validateHumanReviewGate(text) {
  if (!String(text).includes("source: ai_generated")) return { ok: true };
  if (/human_review_required:\s*true\b/.test(text)) return { ok: true };
  return {
    ok: false,
    error: "Scenario run blocked: AI generated scenarios must include human_review_required: true."
  };
}

function validateScenarioSafety(source) {
  const allowedActions = new Set(["goto", "fill", "click", "expect_url", "expect_text", "expect_no_text", "expect_visible"]);
  const lines = String(source).split(/\r?\n/);
  let inSteps = false;
  let sawScenario = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");
    if (!line.trim()) continue;

    const scenarioName = line.match(/^\s*-\s+name:\s*(.+)\s*$/);
    if (scenarioName) {
      sawScenario = true;
      const safeName = sanitizeScenarioName(cleanYamlValue(scenarioName[1]));
      if (!safeName) return { ok: false, error: "scenario.name must contain at least one safe filename character" };
      inSteps = false;
      continue;
    }

    if (/^\s+steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }

    if (inSteps) {
      if (/^\s{0,4}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line) || /^\s*-\s+name:\s*/.test(line)) {
        inSteps = false;
        continue;
      }
      const action = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!action) continue;
      const [, name, value] = action;
      if (!allowedActions.has(name)) return { ok: false, error: `unsupported scenario step: ${name}` };
      if (name === "goto" && !isRelativePath(cleanYamlValue(value))) {
        return { ok: false, error: `goto must be a relative path: ${cleanYamlValue(value)}` };
      }
    }
  }

  if (!sawScenario && /scenarios:\s*\n\s*-/m.test(source)) return { ok: false, error: "scenario.name is required" };
  return { ok: true };
}

function isRelativePath(value) {
  const input = String(value || "").trim();
  if (!input) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return false;
  if (input.startsWith("//")) return false;
  if (input.includes("\\")) return false;
  return true;
}

function sanitizeScenarioName(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function cleanYamlValue(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function playwrightScenarioRunnerSource() {
  return `import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [scenarioPath, baseUrl, resultsPath, screenshotsDir] = process.argv.slice(2);
const text = fs.readFileSync(scenarioPath, "utf8");
const scenarios = parseScenarios(text);
const results = [];

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const errors = [];
    page.on?.("console", (msg) => {
      if (msg.type?.() === "error") errors.push(msg.text?.() || "console error");
    });
    page.on?.("pageerror", (error) => {
      errors.push(error.message);
    });
    const result = { name: scenario.name, status: "passed", errors: [] };
    try {
      for (const step of scenario.steps) {
        await runStep(page, baseUrl, step);
      }
      if (errors.length) throw new Error("Console errors: " + errors.join("; "));
      await page.screenshot?.({ path: path.join(screenshotsDir, safeFileName(scenario.name) + ".png"), fullPage: true });
    } catch (error) {
      result.status = "failed";
      result.errors.push(error instanceof Error ? error.message : String(error));
      try {
        if (page.screenshot) await page.screenshot({ path: path.join(screenshotsDir, safeFileName(scenario.name) + "-failed.png"), fullPage: true });
      } catch {}
    } finally {
      await page.close?.();
    }
    results.push(result);
  }
} finally {
  await browser.close();
}

const failed = results.some((item) => item.status !== "passed");
fs.writeFileSync(resultsPath, JSON.stringify({ result: failed ? "fail" : "pass", scenarios: results }, null, 2) + "\\n");
if (failed) process.exitCode = 1;

async function runStep(page, baseUrl, step) {
  if (step.goto) {
    await page.goto(new URL(step.goto, baseUrl).toString(), { waitUntil: "networkidle", timeout: 30000 });
    return;
  }
  if (step.fill) {
    await locatorFor(page, step.fill).fill(String(step.fill.value ?? ""));
    return;
  }
  if (step.click) {
    await locatorFor(page, step.click).click();
    return;
  }
  if (step.expect_url) {
    const expected = new URL(step.expect_url, baseUrl).toString();
    if (page.url?.() !== expected && !page.url?.().endsWith(String(step.expect_url))) {
      throw new Error("Expected URL " + step.expect_url + " but got " + page.url?.());
    }
    return;
  }
  if (step.expect_text) {
    await page.getByText(String(step.expect_text)).waitFor({ timeout: 5000 });
    return;
  }
  if (step.expect_no_text) {
    const count = await page.getByText(String(step.expect_no_text)).count?.();
    if (count > 0) throw new Error("Unexpected text found: " + step.expect_no_text);
    return;
  }
  if (step.expect_visible) {
    await locatorFor(page, step.expect_visible).waitFor({ state: "visible", timeout: 5000 });
    return;
  }
  throw new Error("Unsupported step: " + JSON.stringify(step));
}

function locatorFor(page, selector) {
  if (selector.role) return page.getByRole(selector.role, selector.name ? { name: selector.name } : undefined);
  if (selector.label) return page.getByLabel(selector.label);
  if (selector.placeholder) return page.getByPlaceholder(selector.placeholder);
  if (selector.text) return page.getByText(selector.text);
  if (selector.test_id && page.getByTestId) return page.getByTestId(selector.test_id);
  throw new Error("Unsupported selector: " + JSON.stringify(selector));
}

function parseScenarios(source) {
  const lines = source.split(/\\r?\\n/);
  const scenarios = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const name = line.match(/^\\s*-\\s+name:\\s*(.+)\\s*$/);
    if (name) {
      current = { name: clean(name[1]), steps: [] };
      scenarios.push(current);
      continue;
    }
    if (!current) continue;
    const inline = line.match(/^\\s*-\\s+(goto|expect_url|expect_text|expect_no_text):\\s*(.+)\\s*$/);
    if (inline) {
      current.steps.push({ [inline[1]]: clean(inline[2]) });
      continue;
    }
    const nested = line.match(/^\\s*-\\s+(fill|click|expect_visible):\\s*$/);
    if (nested) {
      const obj = {};
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const prop = next.match(/^\\s{10,}([A-Za-z0-9_-]+):\\s*(.*)\\s*$/);
        if (!prop) break;
        obj[prop[1].replace(/-/g, "_")] = clean(prop[2]);
        i += 1;
      }
      current.steps.push({ [nested[1]]: obj });
    }
  }
  if (!scenarios.length) throw new Error("No scenarios found.");
  return scenarios;
}

function clean(value) {
  return String(value).trim().replace(/^["']|["']$/g, "");
}

function safeFileName(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^\\.+/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "scenario";
}
`;
}

function basePromptPath(root) {
  return path.join(root, ".aiflow", "artifacts", "tests", "ai-test-base-prompt.md");
}

export function aiTestBasePrompt() {
  return `# AI Test Generation Base Prompt

You are a senior QA architect, Playwright automation expert, and AI delivery workflow auditor.

Goal:
Design professional, executable, reviewable automated test scenarios from the provided requirement, page information, UI brief, existing code/routes/components, and test constraints.

Rules:
- Do not write generic test points; produce executable scenarios.
- Do not let AI freely click through the page. Every action must come from an explicit user flow, requirement, page element, or clearly marked assumption.
- If information is insufficient, do not invent conclusions. Mark assumptions and missing info.
- Cover happy path, edge cases, error states, permission cases, responsive cases, regression risks, and accessibility when relevant.
- Prefer user-perceivable selectors such as label, role, text, placeholder, and accessible name. Avoid fragile CSS class selectors.
- Every test scenario must include purpose, preconditions, test data, steps, assertions, and risk level.
- Scenarios should be suitable for conversion into Playwright tests or aiflow scenario files.
- Before CI enforcement, all AI-generated scenarios must include human_review_required: true.

Required output:

## 1. Test Strategy

- What must be validated most
- Which paths must be automated
- Which items require human review
- Which risks need special attention

## 2. Test Cases

| id | title | type | priority | precondition | test data | steps | assertions | risk |
|---|---|---|---|---|---|---|---|---|

type values:
- happy_path
- edge_case
- error_state
- permission
- responsive
- regression
- accessibility

priority values:
- P0
- P1
- P2

## 3. Executable Scenarios

\`\`\`yaml
scenarios:
  - name: example-scenario
    source: ai_generated
    human_review_required: true
    priority: P0
    type: happy_path
    preconditions:
      - concrete precondition
    test_data:
      key: value
    steps:
      - goto: /route
      - fill:
          label: Field label
          value: value
      - click:
          role: button
          name: Submit
      - expect_text: Success
    evidence:
      screenshots: true
      console_errors: true
      responsive: [desktop, tablet, mobile]
\`\`\`
`;
}
