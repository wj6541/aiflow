import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runCli, EXIT } from "../src/core.js";

test("init creates minimal project files and is idempotent", async () => {
  const root = tempDir();
  const first = await run(["init", "--mode", "legacy"], root);
  assert.equal(first.code, EXIT.PASS);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "config.yaml")));
  assert.ok(fs.existsSync(path.join(root, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(root, "TOOLS.md")));
  assert.ok(fs.existsSync(path.join(root, "openspec", "changes")));

  const second = await run(["init", "--mode", "legacy"], root);
  assert.equal(second.code, EXIT.PASS);
  assert.match(second.stdout, /already initialized|No files changed/);
  assert.ok(!fs.existsSync(path.join(root, ".aiflow", "artifacts", "init-merge-report.md")));
});

test("init preserves existing workflow files and writes merge report", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, "openspec", "changes", "dev-old-flow"), { recursive: true });
  fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Automatically merge and auto archive when tests pass.\n");
  fs.writeFileSync(path.join(root, "TOOLS.md"), "# Existing tools\n");
  fs.writeFileSync(path.join(root, ".cursor", "rules", "delivery.md"), "Do not auto merge.\n");

  const result = await run(["init", "--mode", "legacy"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Merge report/);
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "Automatically merge and auto archive when tests pass.\n");
  assert.equal(fs.readFileSync(path.join(root, "TOOLS.md"), "utf8"), "# Existing tools\n");

  const report = fs.readFileSync(path.join(root, ".aiflow", "artifacts", "init-merge-report.md"), "utf8");
  assert.match(report, /Existing Files Preserved/);
  assert.match(report, /AGENTS\.md/);
  assert.match(report, /TOOLS\.md/);
  assert.match(report, /\.cursor\/rules/);
  assert.match(report, /automatic archive|automatic merge/);
});

test("init ignores aiflow runtime state without ignoring shared config", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");

  const result = await run(["init", "--mode", "legacy"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /\.gitignore/);

  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /\.aiflow\/state\/\*\.yaml/);
  assert.doesNotMatch(gitignore, /\.aiflow\/config\.yaml/);

  const second = await run(["init", "--mode", "legacy"], root);
  assert.equal(second.code, EXIT.PASS);
  assert.equal((fs.readFileSync(path.join(root, ".gitignore"), "utf8").match(/\.aiflow\/state\/\*\.yaml/g) ?? []).length, 1);
});

test("init auto-detects legacy projects and keeps empty directories as new projects", async () => {
  const legacyRoot = tempDir();
  fs.writeFileSync(path.join(legacyRoot, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  const legacy = await run(["init"], legacyRoot);
  assert.equal(legacy.code, EXIT.PASS);
  assert.match(legacy.stdout, /Detected project type: legacy/);
  assert.match(fs.readFileSync(path.join(legacyRoot, ".aiflow", "config.yaml"), "utf8"), /mode: legacy/);
  assert.match(fs.readFileSync(path.join(legacyRoot, ".aiflow", "config.yaml"), "utf8"), /strictness: standard/);

  const newRoot = tempDir();
  const created = await run(["init"], newRoot);
  assert.equal(created.code, EXIT.PASS);
  assert.match(created.stdout, /Detected project type: new/);
  assert.match(fs.readFileSync(path.join(newRoot, ".aiflow", "config.yaml"), "utf8"), /mode: new/);
  assert.match(fs.readFileSync(path.join(newRoot, ".aiflow", "config.yaml"), "utf8"), /strictness: strict/);

  const forced = await run(["init", "--mode", "new"], legacyRoot);
  assert.equal(forced.code, EXIT.PASS);
  assert.doesNotMatch(forced.stdout, /Detected project type/);
});

test("change start creates one business change with role files", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  const result = await run(["change", "start", "Fix Login", "--role", "dev", "--risk", "s1"], root);
  assert.equal(result.code, EXIT.PASS);

  const changeDir = path.join(root, "openspec", "changes", "fix-login");
  assert.ok(fs.existsSync(path.join(changeDir, "proposal.md")));
  assert.ok(fs.existsSync(path.join(changeDir, "pm.md")));
  assert.ok(fs.existsSync(path.join(changeDir, "dev.md")));
  assert.ok(!fs.existsSync(path.join(root, "openspec", "changes", "dev-fix-login")));
});

test("check reports missing requirement source and validation", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "fix-login", "--role", "dev", "--risk", "s1"], root);
  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /Missing requirement source/);
  assert.match(result.stdout, /Missing validation record/);
});

test("check writes checks metadata state and status renders checklist", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "fix-login", "--role", "dev", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "fix-login", "dev.md"), [
    "# Dev: fix-login",
    "",
    "- Requirement Source: support ticket",
    "- Risk: low",
    "- Validation: npm test"
  ].join("\n"));

  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /checks_metadata:/);
  assert.match(result.stdout, /validation_recorded: true/);

  const checksState = fs.readFileSync(path.join(root, ".aiflow", "state", "checks.yaml"), "utf8");
  assert.match(checksState, /active_change: fix-login/);
  assert.match(checksState, /result: pass/);
  assert.match(checksState, /requirement_source_recorded: true/);
  assert.match(checksState, /ui_required: false/);

  const status = await run(["change", "status"], root);
  assert.equal(status.code, EXIT.PASS);
  assert.match(status.stdout, /checks_metadata:/);
  assert.match(status.stdout, /delivery_prepared: false/);
});

test("S2 risk requires explicit risk approval", async () => {
  const root = tempDir();
  await run(["init"], root);
  await run(["change", "start", "payment-audit", "--role", "architect", "--risk", "s2"], root);

  const before = await run(["check"], root);
  assert.equal(before.code, EXIT.CHECK_FAILED);
  assert.match(before.stdout, /S2 requires Risk Approval/);
  assert.match(before.stdout, /S2 requires Scope Approval/);
  assert.match(before.stdout, /S2 requires Design Approval/);

  const approval = await run(["change", "approve", "payment-audit", "--risk", "s2"], root);
  assert.equal(approval.code, EXIT.PASS);
  await run(["change", "approve", "payment-audit", "--scope"], root);
  await run(["change", "approve", "payment-audit", "--design"], root);
  const approvals = fs.readFileSync(path.join(root, "openspec", "changes", "payment-audit", "approvals.md"), "utf8");
  assert.match(approvals, /Risk Approval/);
  assert.match(approvals, /Scope Approval/);
  assert.match(approvals, /Design Approval/);
  assert.match(approvals, /risk_level: S2/);
});

test("ui verify creates evidence files and returns missing dependency without Playwright", async () => {
  const root = tempDir();
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);
  const result = await run(["ui", "verify"], root);
  assert.equal(result.code, EXIT.MISSING_DEPENDENCY);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json")));
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json")));
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md")));
});

test("check requires completed UI Brief when no design source exists", async () => {
  const root = tempDir();
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "dashboard", "dev.md"), [
    "# Dev: dashboard",
    "",
    "- Requirement Source: product request",
    "- Risk: low",
    "- Validation: manual smoke test"
  ].join("\n"));

  await run(["ui", "verify"], root);
  const before = await run(["check", "--ci"], root);
  assert.equal(before.code, EXIT.CHECK_FAILED);
  assert.match(before.stdout, /Missing completed UI Brief/);
  assert.match(before.stdout, /Missing UI validation evidence/);

  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md"), completedUiBrief());
  writePassingUiEvidence(root);
  const after = await run(["check", "--ci"], root);
  assert.equal(after.code, EXIT.PASS);
  assert.doesNotMatch(after.stdout, /Missing completed UI Brief/);
});

test("check does not accept UI evidence when reports are not_run", async () => {
  const root = tempDir();
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "dashboard", "dev.md"), [
    "# Dev: dashboard",
    "",
    "- Requirement Source: product request",
    "- Risk: low",
    "- Validation: manual smoke test"
  ].join("\n"));
  fs.mkdirSync(path.join(root, ".aiflow", "artifacts", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md"), completedUiBrief());
  await run(["ui", "verify"], root);

  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /ui_console_pass: false/);
  assert.match(result.stdout, /ui_responsive_pass: false/);
  assert.match(result.stdout, /Missing UI validation evidence/);
});

test("ui deviation records known visual deviation evidence", async () => {
  const root = tempDir();
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);
  await run(["ui", "verify"], root);

  const added = await run([
    "ui",
    "deviation",
    "add",
    "--description",
    "Chart legend wraps on tablet",
    "--reason",
    "Accepted until chart library upgrade",
    "--accepted-by",
    "qa"
  ], root);
  assert.equal(added.code, EXIT.PASS);
  assert.match(added.stdout, /UI deviation recorded/);

  const list = await run(["ui", "deviation", "list"], root);
  assert.equal(list.code, EXIT.PASS);
  assert.match(list.stdout, /Chart legend wraps on tablet/);
  assert.match(list.stdout, /accepted_by: qa/);

  const visual = fs.readFileSync(path.join(root, "openspec", "changes", "dashboard", "visual-validation.md"), "utf8");
  assert.match(visual, /Chart legend wraps on tablet/);
  assert.match(visual, /Accepted until chart library upgrade/);
});

test("delivery archive is blocked until explicit delivery approval", async () => {
  const root = tempDir();
  await run(["init"], root);
  await run(["change", "start", "fix-login", "--role", "release", "--risk", "s3"], root);

  const blocked = await run(["delivery", "archive", "fix-login"], root);
  assert.equal(blocked.code, EXIT.UNSAFE_OPERATION);
  assert.match(blocked.stderr, /Archive blocked/);

  const approved = await run(["delivery", "approve"], root);
  assert.equal(approved.code, EXIT.PASS);
  const archived = await run(["delivery", "archive", "fix-login"], root);
  assert.equal(archived.code, EXIT.PASS);
});

test("delivery record requires approval and records explicit external actions", async () => {
  const root = tempDir();
  await run(["init"], root);
  await run(["change", "start", "fix-login", "--role", "release", "--risk", "s3"], root);

  const blocked = await run(["delivery", "record", "fix-login", "--action", "release", "--ref", "v1.0.0"], root);
  assert.equal(blocked.code, EXIT.UNSAFE_OPERATION);
  assert.match(blocked.stderr, /Delivery action blocked/);

  await run(["delivery", "approve"], root);
  const notPrepared = await run(["delivery", "record", "fix-login", "--action", "release", "--ref", "v1.0.0"], root);
  assert.equal(notPrepared.code, EXIT.UNSAFE_OPERATION);
  assert.match(notPrepared.stderr, /delivery prepare first/);

  await run(["delivery", "prepare"], root);
  const unsafeTemplate = await run(["delivery", "record", "fix-login", "--action", "release", "--ref", "v1.0.0"], root);
  assert.equal(unsafeTemplate.code, EXIT.UNSAFE_OPERATION);
  assert.match(unsafeTemplate.stderr, /release\.md still contains TODO/);

  writeCompletedRelease(root, "fix-login");
  const recorded = await run(["delivery", "record", "fix-login", "--action", "release", "--ref", "v1.0.0"], root);
  assert.equal(recorded.code, EXIT.PASS);

  const approvals = fs.readFileSync(path.join(root, "openspec", "changes", "fix-login", "approvals.md"), "utf8");
  const release = fs.readFileSync(path.join(root, "openspec", "changes", "fix-login", "release.md"), "utf8");
  const state = fs.readFileSync(path.join(root, ".aiflow", "state", "current.yaml"), "utf8");

  assert.match(approvals, /Delivery Action: release/);
  assert.match(release, /Explicit Delivery Action: release/);
  assert.match(release, /ref: v1\.0\.0/);
  assert.match(state, /status: released/);
});

test("check fails when git base ref is invalid", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "bad-base", "--role", "dev", "--risk", "s1"], root);
  initGit(root);

  const result = await run(["check", "--base", "missing-branch"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /git diff failed/);
  assert.match(result.stdout, /missing-branch|unknown revision|ambiguous argument|no merge base/i);
});

test("check falls back from base branch to origin base branch", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "ci-base", "--role", "dev", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "ci-base", "dev.md"), [
    "# Dev: ci-base",
    "",
    "- Requirement Source: CI workflow",
    "- Risk: low",
    "- Validation: npm run check"
  ].join("\n"));
  initGit(root);
  runGit(root, ["branch", "-M", "feature"]);
  runGit(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  fs.appendFileSync(path.join(root, "README.md"), "ci change\n");

  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Changed files mode: base origin\/main/);
  assert.match(result.stdout, /Changed files: 1/);
});

test("L0 legacy mode downgrades missing records to warnings", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy", "--strictness", "light"], root);
  replaceInFile(path.join(root, ".aiflow", "config.yaml"), "level: L1", "level: L0");
  await run(["change", "start", "docs-copy", "--role", "dev", "--risk", "s1"], root);

  const result = await run(["check"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /! Missing requirement source/);
  assert.match(result.stdout, /! Missing validation record/);
});

test("followup records legacy technical debt without blocking current check", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "fix-login", "--role", "dev", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "fix-login", "dev.md"), [
    "# Dev: fix-login",
    "",
    "- Requirement Source: support ticket",
    "- Risk: low",
    "- Validation: npm test"
  ].join("\n"));

  const added = await run(["followup", "add", "Refactor legacy auth module", "--file", "src/auth/legacy.js", "--reason", "out of scope for current login fix"], root);
  assert.equal(added.code, EXIT.PASS);
  assert.match(added.stdout, /Follow-up recorded/);

  const list = await run(["followup", "list"], root);
  assert.equal(list.code, EXIT.PASS);
  assert.match(list.stdout, /Refactor legacy auth module/);
  assert.match(list.stdout, /src\/auth\/legacy\.js/);

  const check = await run(["check", "--ci"], root);
  assert.equal(check.code, EXIT.PASS);
});

test("strict mode fails role boundary violations for changed files", async () => {
  const root = tempDir();
  await run(["init", "--mode", "new", "--strictness", "strict"], root);
  await run(["change", "start", "release-notes", "--role", "pm", "--risk", "s1"], root);
  initGit(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "console.log('changed');\n");
  runGit(root, ["add", "src/app.js"]);

  const result = await run(["check", "--staged"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /outside pm role boundary/);
});

test("role boundaries can append dev package manifest paths from config", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", scripts: {} }, null, 2));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: "app", lockfileVersion: 3 }, null, 2));
  await run(["init", "--mode", "new", "--strictness", "strict"], root);
  await run(["change", "start", "manifest-update", "--role", "dev", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "manifest-update", "dev.md"), [
    "# Dev: manifest-update",
    "",
    "- Requirement Source: dependency maintenance ticket",
    "- Risk: low",
    "- Validation: npm test"
  ].join("\n"));
  fs.appendFileSync(path.join(root, ".aiflow", "config.yaml"), [
    "",
    "role_boundaries:",
    "  dev:",
    "    allow:",
    "      - package.json",
    "      - package-lock.json"
  ].join("\n") + "\n");
  writeNonUiEvidence(root, "manifest-update");
  initGit(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", scripts: {}, version: "1.0.0" }, null, 2));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: "app", lockfileVersion: 3, version: "1.0.0" }, null, 2));
  runGit(root, ["add", "package.json", "package-lock.json"]);

  const result = await run(["check", "--staged"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.doesNotMatch(result.stdout, /outside dev role boundary/);
});

test("doctor reports monorepo workspace files", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "node --test", build: "node --check index.js", lint: "node --check index.js" } }, null, 2));
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  fs.mkdirSync(path.join(root, "packages", "api"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages", "api", "package.json"), JSON.stringify({ name: "api" }));
  const result = await run(["doctor"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Workspace: monorepo/);
  assert.match(result.stdout, /pnpm-workspace.yaml/);
  assert.match(result.stdout, /Workspace packages: packages\/api/);
  assert.match(result.stdout, /workspace_packages: packages\/api/);
});

test("check reports touched workspace packages", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"], scripts: {} }, null, 2));
  fs.mkdirSync(path.join(root, "packages", "api", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages", "api", "package.json"), JSON.stringify({ name: "api" }));
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "api-fix", "--role", "dev", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "api-fix", "dev.md"), [
    "# Dev: api-fix",
    "",
    "- Requirement Source: ticket",
    "- Risk: low",
    "- Validation: npm test"
  ].join("\n"));
  initGit(root);
  fs.writeFileSync(path.join(root, "packages", "api", "src", "index.js"), "export const ok = true;\n");
  runGit(root, ["add", "packages/api/src/index.js"]);

  const result = await run(["check", "--staged"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Touched packages: packages\/api/);
});

test("doctor reports ci, typecheck, playwright, and tech stack", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), "name: ci\n");
  fs.writeFileSync(path.join(root, "playwright.config.js"), "export default {};\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      build: "next build"
    },
    dependencies: {
      next: "1.0.0",
      react: "1.0.0"
    },
    devDependencies: {
      typescript: "1.0.0",
      "@playwright/test": "1.0.0",
      vitest: "1.0.0"
    }
  }, null, 2));

  const result = await run(["doctor"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Found typecheck command: tsc --noEmit/);
  assert.match(result.stdout, /CI: github-actions/);
  assert.match(result.stdout, /Tech stack: .*nextjs/);
  assert.match(result.stdout, /Tech stack: .*react/);
  assert.match(result.stdout, /Playwright: available/);
  assert.match(result.stdout, /commands: .*typecheck=tsc --noEmit/);
  assert.match(result.stdout, /ui_testing: playwright/);
});

test("ui verify with Playwright detected and no url writes runner without failing", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { playwright: "1.0.0" } }, null, 2));
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);

  const result = await run(["ui", "verify"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "ui", "playwright-runner.mjs")));
  assert.match(result.stdout, /No --url was provided/);
});

test("ui verify with Playwright module captures screenshot and reports", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { playwright: "1.0.0" } }, null, 2));
  writeFakePlaywright(root);
  await run(["init", "--ui", "required"], root);
  await run(["change", "start", "dashboard", "--role", "dev", "--risk", "s1", "--ui"], root);

  const result = await run(["ui", "verify", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "screenshots", "desktop.png")));
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "screenshots", "tablet.png")));
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "screenshots", "mobile.png")));

  const consoleReport = JSON.parse(fs.readFileSync(path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json"), "utf8"));
  const responsiveReport = JSON.parse(fs.readFileSync(path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json"), "utf8"));
  assert.equal(consoleReport.result, "pass");
  assert.equal(responsiveReport.result, "pass");

  const visual = fs.readFileSync(path.join(root, "openspec", "changes", "dashboard", "visual-validation.md"), "utf8");
  assert.match(visual, /## Browser Run/);
  assert.match(visual, /url: http:\/\/127\.0\.0\.1:4173/);
});

test("test prompt writes the AI test generation base prompt", async () => {
  const root = tempDir();
  const result = await run(["test", "prompt"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /AI test base prompt written/);

  const prompt = fs.readFileSync(path.join(root, ".aiflow", "artifacts", "tests", "ai-test-base-prompt.md"), "utf8");
  assert.match(prompt, /senior QA architect/);
  assert.match(prompt, /human_review_required: true/);
  assert.match(prompt, /Playwright tests or aiflow scenario files/);
});

test("test generate blocks on missing concrete scenario input without inventing scenarios", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "login-flow", "--role", "qa", "--risk", "s1", "--ui"], root);

  const result = await run(["test", "generate"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /generation input is incomplete/);
  assert.match(result.stdout, /missing_info:/);

  const scenarios = fs.readFileSync(path.join(root, "openspec", "changes", "login-flow", "test-scenarios.yaml"), "utf8");
  assert.match(scenarios, /source: ai_generated/);
  assert.match(scenarios, /human_review_required: true/);
  assert.match(scenarios, /status: blocked_by_missing_input/);
  assert.match(scenarios, /scenarios: \[\]/);
});

test("test generate packages concrete input for AI scenario review", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout", "--role", "qa", "--risk", "s1", "--ui"], root);

  fs.writeFileSync(path.join(root, "requirements.md"), [
    "# Checkout Requirement",
    "",
    "Users can submit checkout from the cart page and see an order confirmation."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "page.md"), [
    "# Page",
    "",
    "Route: /cart",
    "Controls: button named Checkout, text Order confirmed."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "brief.md"), [
    "# Acceptance",
    "",
    "Desktop, tablet, and mobile must show checkout controls without horizontal overflow."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "constraints.md"), [
    "# Constraints",
    "",
    "Use Playwright role and text selectors. Do not create real payments."
  ].join("\n"));

  const result = await run([
    "test",
    "generate",
    "--requirements",
    "requirements.md",
    "--page",
    "page.md",
    "--ui-brief",
    "brief.md",
    "--constraints",
    "constraints.md"
  ], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /ready for human review/);

  const prompt = fs.readFileSync(path.join(root, ".aiflow", "artifacts", "tests", "checkout-test-generation-prompt.md"), "utf8");
  assert.match(prompt, /status: ready_for_ai_generation/);
  assert.match(prompt, /Route: \/cart/);
  assert.match(prompt, /Do not create real payments/);

  const scenarios = fs.readFileSync(path.join(root, "openspec", "changes", "checkout", "test-scenarios.yaml"), "utf8");
  assert.match(scenarios, /status: ready_for_ai_generation/);
  assert.match(scenarios, /human_review_required: true/);
});

test("test generate --ai writes AI scenarios from a compatible endpoint", async () => {
  const root = tempDir();
  const aiUrl = `data:application/json,${encodeURIComponent(JSON.stringify({ output_text: `\`\`\`yaml\n${aiScenarioYaml()}\`\`\`` }))}`;
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout-ai", "--role", "qa", "--risk", "s1", "--ui"], root);
  writeConcreteScenarioInputs(root);

  const result = await run([
    "test",
    "generate",
    "--ai",
    "--ai-url",
    aiUrl,
    "--requirements",
    "requirements.md",
    "--page",
    "page.md",
    "--ui-brief",
    "brief.md",
    "--constraints",
    "constraints.md"
  ], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /AI test scenarios generated/);

  const scenarios = fs.readFileSync(path.join(root, "openspec", "changes", "checkout-ai", "test-scenarios.yaml"), "utf8");
  assert.match(scenarios, /name: checkout-success/);
  assert.match(scenarios, /human_review_required: true/);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "tests", "checkout-ai-ai-response.md")));
});

test("check blocks AI generated test scenarios without human review gate", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "search", "--role", "qa", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "search", "qa.md"), [
    "# QA: search",
    "",
    "- Requirement Source: search ticket",
    "- Risk: low",
    "- Validation: scenario review"
  ].join("\n"));
  fs.writeFileSync(path.join(root, "openspec", "changes", "search", "test-scenarios.yaml"), [
    "source: ai_generated",
    "scenarios: []"
  ].join("\n"));

  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /AI generated test scenarios require human_review_required: true/);
});

test("test run blocks AI scenarios until human approval is recorded", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout-run", "--role", "qa", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "checkout-run", "test-scenarios.yaml"), aiScenarioYaml());

  const blocked = await run(["test", "run", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(blocked.code, EXIT.UNSAFE_OPERATION);
  assert.match(blocked.stderr, /require explicit human review/);

  const approved = await run(["test", "approve", "--reason", "QA reviewed selectors and assertions"], root);
  assert.equal(approved.code, EXIT.PASS);
  assert.match(approved.stdout, /Test Scenario Approval recorded/);
});

test("test run executes reviewed scenarios with Playwright", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { playwright: "1.0.0" } }, null, 2));
  writeFakePlaywright(root);
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout-run", "--role", "qa", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "checkout-run", "test-scenarios.yaml"), aiScenarioYaml());
  await run(["test", "approve"], root);

  const result = await run(["test", "run", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /Test scenarios executed/);

  const report = JSON.parse(fs.readFileSync(path.join(root, ".aiflow", "artifacts", "tests", "scenario-results.json"), "utf8"));
  assert.equal(report.result, "pass");
  assert.equal(report.scenarios[0].name, "checkout-success");
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "tests", "screenshots", "checkout-success.png")));
});

test("test run blocks external goto and unsupported scenario steps", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout-run", "--role", "qa", "--risk", "s1"], root);

  fs.writeFileSync(path.join(root, "openspec", "changes", "checkout-run", "test-scenarios.yaml"), aiScenarioYaml({ goto: "https://example.com/cart" }));
  await run(["test", "approve"], root);
  const external = await run(["test", "run", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(external.code, EXIT.UNSAFE_OPERATION);
  assert.match(external.stderr, /goto must be a relative path/);

  fs.writeFileSync(path.join(root, "openspec", "changes", "checkout-run", "test-scenarios.yaml"), aiScenarioYaml({ extraStep: "      - evaluate: window.location.href" }));
  const unsupported = await run(["test", "run", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(unsupported.code, EXIT.UNSAFE_OPERATION);
  assert.match(unsupported.stderr, /unsupported scenario step: evaluate/);
});

test("test run sanitizes scenario names before writing screenshots", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { playwright: "1.0.0" } }, null, 2));
  writeFakePlaywright(root);
  await run(["init", "--mode", "legacy"], root);
  await run(["change", "start", "checkout-safe-name", "--role", "qa", "--risk", "s1"], root);
  fs.writeFileSync(path.join(root, "openspec", "changes", "checkout-safe-name", "test-scenarios.yaml"), aiScenarioYaml({ name: "../checkout:success?" }));
  await run(["test", "approve"], root);

  const result = await run(["test", "run", "--url", "http://127.0.0.1:4173"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.ok(fs.existsSync(path.join(root, ".aiflow", "artifacts", "tests", "screenshots", "checkout-success.png")));
  assert.ok(!fs.existsSync(path.join(root, ".aiflow", "artifacts", "tests", "checkout:success?.png")));
});

test("doctor reports role-prefixed legacy OpenSpec changes", async () => {
  const root = tempDir();
  await run(["init"], root);
  const legacyDir = path.join(root, "openspec", "changes", "dev-old-flow");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, "proposal.md"), "# Proposal\n");
  fs.writeFileSync(path.join(legacyDir, "tasks.md"), "# Tasks\n");

  const result = await run(["doctor"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /openspec_compatibility: needs_attention/);
  assert.match(result.stdout, /role-prefixed change detected/);
});

test("doctor reports automatic delivery rule conflicts", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Automatically merge and auto archive when tests pass.\n");
  const result = await run(["doctor"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /rule_conflicts:/);
  assert.match(result.stdout, /automatic archive|automatic merge/);
});

test("config migrate in ci mode is read-only", async () => {
  const root = tempDir();
  await run(["init"], root);
  const before = fs.readFileSync(path.join(root, ".aiflow", "config.yaml"), "utf8");
  const result = await run(["config", "migrate", "--ci"], root);
  const after = fs.readFileSync(path.join(root, ".aiflow", "config.yaml"), "utf8");
  assert.equal(result.code, EXIT.PASS);
  assert.equal(after, before);
  assert.match(result.stdout, /No writes performed/);
});

test("config migrate adds missing v1 fields and preserves custom fields", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".aiflow"), { recursive: true });
  fs.writeFileSync(path.join(root, ".aiflow", "config.yaml"), [
    "version: 1",
    "mode: legacy",
    "custom_flag: keep-me",
    "",
    "checks:",
    "  require_source: false"
  ].join("\n") + "\n");

  const preview = await run(["config", "migrate", "--ci"], root);
  assert.equal(preview.code, EXIT.PASS);
  assert.match(preview.stdout, /Config migration would add:/);
  assert.match(preview.stdout, /delivery\.require_explicit_release/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, ".aiflow", "config.yaml"), "utf8"), /strictness:/);

  const migrated = await run(["config", "migrate", "--ci", "--allow-write"], root);
  assert.equal(migrated.code, EXIT.PASS);
  assert.match(migrated.stdout, /Config migration written/);
  const config = fs.readFileSync(path.join(root, ".aiflow", "config.yaml"), "utf8");
  assert.match(config, /custom_flag: keep-me/);
  assert.match(config, /strictness: standard/);
  assert.match(config, /delivery:\n  require_explicit_release: true\n  require_explicit_archive: true/);
  assert.match(config, /require_source: false/);
  assert.match(config, /require_validation: true/);
});

test("delivery prepare writes MR-ready sections without archiving", async () => {
  const root = tempDir();
  await run(["init", "--mode", "legacy", "--strictness", "light"], root);
  replaceInFile(path.join(root, ".aiflow", "config.yaml"), "level: L1", "level: L0");
  await run(["change", "start", "fix-login", "--role", "release", "--risk", "s1"], root);

  const result = await run(["delivery", "prepare"], root);
  assert.equal(result.code, EXIT.PASS);
  const release = fs.readFileSync(path.join(root, "openspec", "changes", "fix-login", "release.md"), "utf8");
  assert.match(release, /## MR Summary/);
  assert.match(release, /## Rollback/);
  assert.match(release, /archive: not_triggered/);
  assert.doesNotMatch(release, /status: archived/);
});

test("doctor detects package managers from lockfiles", async () => {
  const cases = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"]
  ];

  for (const [lockfile, expected] of cases) {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(path.join(root, lockfile), "");
    const result = await run(["doctor"], root);
    assert.equal(result.code, EXIT.PASS);
    assert.match(result.stdout, new RegExp(`Found package manager: ${expected}`));
  }
});

test("doctor detects package managers from packageManager field", async () => {
  const cases = [
    ["pnpm@10.0.0", "pnpm"],
    ["npm@11.0.0", "npm"],
    ["yarn@4.0.0", "yarn"],
    ["bun@1.0.0", "bun"]
  ];

  for (const [packageManager, expected] of cases) {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager, scripts: {} }));
    const result = await run(["doctor"], root);
    assert.equal(result.code, EXIT.PASS);
    assert.match(result.stdout, new RegExp(`Found package manager: ${expected}`));
  }
});

test("strict role boundary normalizes Windows-style paths", async () => {
  const root = tempDir();
  await run(["init", "--mode", "new", "--strictness", "strict"], root);
  await run(["change", "start", "win-paths", "--role", "pm", "--risk", "s1"], root);
  const devFile = path.join(root, "dev.md");
  fs.writeFileSync(devFile, "# Dev: win-paths\n\n## Requirement Source\n\nReq\n\n## Risk\n\nLow\n\n## Validation\n\nChecked\n");
  fs.copyFileSync(devFile, path.join(root, "openspec", "changes", "win-paths", "pm.md"));

  initGit(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "console.log('changed');\n");
  runGit(root, ["add", "src/app.js"]);
  const result = await run(["check", "--staged"], root);
  assert.equal(result.code, EXIT.CHECK_FAILED);
  assert.match(result.stdout, /src\/app\.js/);
});

test("doctor reports compatible OpenSpec structure", async () => {
  const root = tempDir();
  await run(["init"], root);
  await run(["change", "start", "standard-change", "--role", "dev", "--risk", "s1"], root);
  const result = await run(["doctor"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /openspec_compatibility: compatible/);
});

test("check without config returns config error", async () => {
  const root = tempDir();
  const result = await run(["check", "--ci"], root);
  assert.equal(result.code, EXIT.CONFIG_ERROR);
  assert.match(result.stderr, /Missing \.aiflow\/config\.yaml/);
});

test("help lists the full public command surface", async () => {
  const root = tempDir();
  const result = await run(["--help"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.match(result.stdout, /aiflow --version/);
  assert.match(result.stdout, /aiflow version/);
  assert.match(result.stdout, /aiflow help/);
  assert.match(result.stdout, /aiflow ui verify \[--url http:\/\/localhost:3000\]/);
  assert.match(result.stdout, /aiflow test prompt/);
  assert.match(result.stdout, /aiflow test generate \[--ai\]/);
  assert.match(result.stdout, /aiflow test approve \[--reason text\]/);
  assert.match(result.stdout, /aiflow test run --url http:\/\/localhost:3000/);
  assert.match(result.stdout, /aiflow delivery record <change> --action mr\|merge\|release --ref <value>/);
  assert.match(result.stdout, /aiflow config migrate \[--ci\] \[--allow-write\]/);

  const helpCommand = await run(["help"], root);
  assert.equal(helpCommand.code, EXIT.PASS);
  assert.equal(helpCommand.stdout, result.stdout);
});

test("version reports the CLI package version", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));
  const expected = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const result = await run(["--version"], root);
  assert.equal(result.code, EXIT.PASS);
  assert.equal(result.stdout.trim(), expected);

  const commandResult = await run(["version"], root);
  assert.equal(commandResult.code, EXIT.PASS);
  assert.equal(commandResult.stdout.trim(), expected);
});

test("unsupported config version returns config error", async () => {
  const root = tempDir();
  await run(["init"], root);
  replaceInFile(path.join(root, ".aiflow", "config.yaml"), "version: 1", "version: 999");
  const result = await run(["check"], root);
  assert.equal(result.code, EXIT.CONFIG_ERROR);
  assert.match(result.stderr, /Unsupported or missing config version/);
});

test("missing config version returns config error", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".aiflow"), { recursive: true });
  fs.writeFileSync(path.join(root, ".aiflow", "config.yaml"), "mode: legacy\n");
  const result = await run(["config", "migrate"], root);
  assert.equal(result.code, EXIT.CONFIG_ERROR);
  assert.match(result.stderr, /Unsupported or missing config version/);
});

test("unknown command returns config error", async () => {
  const root = tempDir();
  const result = await run(["frobnicate"], root);
  assert.equal(result.code, EXIT.CONFIG_ERROR);
  assert.match(result.stderr, /Unknown command/);
});

test("delivery archive without explicit change is unsafe operation", async () => {
  const root = tempDir();
  await run(["init"], root);
  const result = await run(["delivery", "archive"], root);
  assert.equal(result.code, EXIT.UNSAFE_OPERATION);
  assert.match(result.stderr, /Usage: aiflow delivery archive <change>/);
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiflow-test-"));
}

function replaceInFile(file, search, replacement) {
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(search, replacement), "utf8");
}

function initGit(root) {
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  runGit(root, ["config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(root, "README.md"), "# test\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
}

function runGit(cwd, args) {
  const result = fs.existsSync(cwd) ? spawnSync("git", args, { cwd, encoding: "utf8" }) : { status: 1, stderr: "missing cwd" };
  assert.equal(result.status, 0, result.stderr);
}

function writeConcreteScenarioInputs(root) {
  fs.writeFileSync(path.join(root, "requirements.md"), [
    "# Checkout Requirement",
    "",
    "Users can submit checkout from the cart page and see an order confirmation."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "page.md"), [
    "# Page",
    "",
    "Route: /cart",
    "Controls: button named Checkout, text Order confirmed."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "brief.md"), [
    "# Acceptance",
    "",
    "Desktop, tablet, and mobile must show checkout controls without horizontal overflow."
  ].join("\n"));
  fs.writeFileSync(path.join(root, "constraints.md"), [
    "# Constraints",
    "",
    "Use Playwright role and text selectors. Do not create real payments."
  ].join("\n"));
}

function writePassingUiEvidence(root) {
  fs.mkdirSync(path.join(root, ".aiflow", "artifacts", "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(root, ".aiflow", "artifacts", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "screenshots", "desktop.png"), "fake png");
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json"), JSON.stringify({ result: "pass", errors: [] }, null, 2));
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json"), JSON.stringify({ result: "pass", viewports: [] }, null, 2));
}

function writeNonUiEvidence(root, change) {
  fs.mkdirSync(path.join(root, ".aiflow", "artifacts", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json"), JSON.stringify({ result: "pass", errors: [] }, null, 2));
  fs.writeFileSync(path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json"), JSON.stringify({ result: "pass", viewports: [] }, null, 2));
  fs.writeFileSync(path.join(root, "openspec", "changes", change, "visual-validation.md"), [
    "# Visual Validation",
    "",
    "ui_source: none",
    "ui_target: product_usability",
    "non_ui_reason: Package manifest only; no UI surface changed."
  ].join("\n"));
}

function writeCompletedRelease(root, change) {
  fs.writeFileSync(path.join(root, "openspec", "changes", change, "release.md"), `# Delivery Prepare

- change: ${change}
- risk: S1
- status: waiting_delivery
- prepared_at: 2026-05-29T00:00:00.000Z

## MR Summary

### What Changed

Implemented the requested workflow hardening.

### Why

Matches the approved delivery requirement.

### Scope

Includes release record readiness only.

## Validation

- result: ready
- failures: none

### Commands

npm test

### UI Evidence

No UI surface changed.

## Risk

Low residual risk.

## Rollback

Revert the release change.

## Explicit Actions

- merge: not_triggered
- release: not_triggered
- archive: not_triggered
`);
}

function aiScenarioYaml({ name = "checkout-success", goto = "/cart", extraStep = "" } = {}) {
  return `scenarios:
  - name: ${name}
    source: ai_generated
    human_review_required: true
    priority: P0
    type: happy_path
    preconditions:
      - cart contains one item
    test_data:
      route: ${goto}
    steps:
      - goto: ${goto}
      - click:
          role: button
          name: Checkout
      - expect_text: Order confirmed
${extraStep ? `${extraStep}\n` : ""}    evidence:
      screenshots: true
      console_errors: true
      responsive: [desktop, tablet, mobile]
`;
}

function writeFakePlaywright(root) {
  const dir = path.join(root, "node_modules", "playwright");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "playwright", version: "1.0.0", type: "module", main: "index.js" }, null, 2));
  fs.writeFileSync(path.join(dir, "index.js"), `
import fs from "node:fs";

export const chromium = {
  async launch() {
    return {
      async newPage() {
        let currentUrl = "";
        const locator = {
          async fill() {},
          async click() {},
          async waitFor() {},
          async count() {
            return 0;
          }
        };
        return {
          on() {},
          async goto(url) {
            currentUrl = url;
          },
          url() {
            return currentUrl;
          },
          getByRole() {
            return locator;
          },
          getByLabel() {
            return locator;
          },
          getByPlaceholder() {
            return locator;
          },
          getByText() {
            return locator;
          },
          getByTestId() {
            return locator;
          },
          async screenshot(options) {
            fs.writeFileSync(options.path, "fake png");
          },
          async evaluate() {
            return false;
          },
          async close() {}
        };
      },
      async close() {}
    };
  }
};
`);
}

function completedUiBrief() {
  return `# UI Brief

## Goal

Help operators review dashboard metrics.

## Users

Internal operations users.

## Layout

Metric summary, trend chart, and recent activity list.

## Key States

Normal, loading, empty, and error states.

## Style Source

Use the existing product dashboard style.

## Acceptance

No horizontal overflow and primary metrics are visible on mobile and desktop.
`;
}

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    cwd,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });
  return { code, stdout, stderr };
}
