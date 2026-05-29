import fs from "node:fs";
import path from "node:path";
import { EXIT, RISKS, ROLES } from "./constants.js";
import { collectChecks, renderCheck, renderChecksState, renderStatus, resolveChangedFiles } from "./check.js";
import { defaultConfig, inspectConfigMigration, loadConfig, loadState, renderConfig, renderSimpleYaml, updateState } from "./config.js";
import { appendApproval, approveDelivery, archiveDelivery, prepareDelivery, recordDeliveryAction } from "./delivery.js";
import { ensureDir, exists, relative, writeIfMissing, writeText } from "./fs-utils.js";
import { currentCommit, detectAiRules, detectCi, detectCommands, detectPackageManager, detectTechStack, detectWorkspace, hasPlaywright, inspectOpenSpec, inspectRuleConflicts, isGitRepo, readPackageJson } from "./project.js";
import { defaultAgents, defaultOpenSpecReadme, defaultProjectProfile, defaultTools, templateDesign, templateProposal, templateRole, templateTasks, templateUi, templateVisualValidation } from "./templates.js";
import { generateAiTestScenarios, runTestScenarios, writeAiTestBasePrompt } from "./test-scenarios.js";
import { addUiDeviation, listUiDeviations, uiClassify as buildUiClassify, uiVerify as runUiVerify } from "./ui.js";

export { EXIT };

export async function runCli(argv, io) {
  const parsed = parseArgs(argv);
  const command = parsed.positionals[0];

  if (parsed.flags.version || command === "version") {
    io.stdout.write(`${packageVersion(io.cwd)}\n`);
    return EXIT.PASS;
  }

  if (!command || parsed.flags.help || command === "help") {
    io.stdout.write(helpText());
    return EXIT.PASS;
  }

  if (command === "init") return commandInit(parsed, io);
  if (command === "doctor") return commandDoctor(parsed, io);
  if (command === "change") return commandChange(parsed, io);
  if (command === "check") return commandCheck(parsed, io);
  if (command === "ui") return commandUi(parsed, io);
  if (command === "test") return commandTest(parsed, io);
  if (command === "handoff") return commandHandoff(parsed, io);
  if (command === "delivery") return commandDelivery(parsed, io);
  if (command === "followup") return commandFollowup(parsed, io);
  if (command === "config") return commandConfig(parsed, io);

  io.stderr.write(`Unknown command: ${command}\n`);
  return EXIT.CONFIG_ERROR;
}

function commandInit(parsed, io) {
  const root = io.cwd;
  const requestedMode = value(parsed, "mode", "auto");
  const mode = requestedMode === "auto" ? detectInitMode(root) : requestedMode;
  const strictness = value(parsed, "strictness", mode === "legacy" ? "standard" : "strict");
  const ui = value(parsed, "ui", "auto");

  if (!["auto", "new", "legacy"].includes(requestedMode)) return fail(io, EXIT.CONFIG_ERROR, "Invalid --mode. Use auto, new, or legacy.");
  if (!["light", "standard", "strict"].includes(strictness)) {
    return fail(io, EXIT.CONFIG_ERROR, "Invalid --strictness. Use light, standard, or strict.");
  }
  if (!["auto", "required", "off"].includes(ui)) return fail(io, EXIT.CONFIG_ERROR, "Invalid --ui. Use auto, required, or off.");

  const alreadyInitialized = exists(path.join(root, ".aiflow", "config.yaml"));
  const mergeCandidates = alreadyInitialized ? [] : collectExistingWorkflowFiles(root);
  ensureDir(path.join(root, ".aiflow", "state"));
  ensureDir(path.join(root, ".aiflow", "artifacts"));
  ensureDir(path.join(root, "openspec", "changes"));
  ensureDir(path.join(root, "openspec", "specs"));
  ensureDir(path.join(root, "docs"));

  const packageManager = detectPackageManager(root);
  const config = defaultConfig({ mode, strictness, ui, packageManager });

  const writes = [];
  writeIfMissing(path.join(root, ".aiflow", "config.yaml"), renderConfig(config), writes);
  writeIfMissing(path.join(root, "AGENTS.md"), defaultAgents(), writes);
  writeIfMissing(path.join(root, "TOOLS.md"), defaultTools(packageManager), writes);
  writeIfMissing(path.join(root, "docs", "project-profile.md"), defaultProjectProfile(), writes);
  writeIfMissing(path.join(root, "openspec", "README.md"), defaultOpenSpecReadme(), writes);
  ensureRuntimeStateIgnored(root, writes);

  const mergeReport = mergeCandidates.length ? writeInitMergeReport(root, mergeCandidates) : "";

  io.stdout.write(`aiflow init complete\n`);
  io.stdout.write(`Mode: ${mode}${mode === "legacy" ? " incremental" : ""}\n`);
  if (requestedMode === "auto") io.stdout.write(`Detected project type: ${mode}\n`);
  io.stdout.write(`Strictness: ${strictness}\n`);
  io.stdout.write(`UI: ${ui}\n`);
  if (writes.length) {
    io.stdout.write(`Created:\n${writes.map((file) => `- ${relative(root, file)}`).join("\n")}\n`);
  } else {
    io.stdout.write("No files changed; project is already initialized.\n");
  }
  if (mergeReport) {
    io.stdout.write(`Merge report:\n- ${relative(root, mergeReport)}\n`);
  }
  return EXIT.PASS;
}

function detectInitMode(root) {
  const legacySignals = [
    ".git",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "bun.lock",
    "src",
    "app",
    "packages",
    "web",
    "openspec",
    "AGENTS.md",
    "TOOLS.md",
    ".cursor"
  ];
  return legacySignals.some((name) => exists(path.join(root, name))) ? "legacy" : "new";
}

function ensureRuntimeStateIgnored(root, writes) {
  const ignoreFile = path.join(root, ".gitignore");
  const requiredPattern = ".aiflow/state/*.yaml";
  const content = exists(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "";
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(requiredPattern) || lines.includes(".aiflow/state/")) return false;

  const separator = content.length ? (content.endsWith("\n") ? "\n" : "\n\n") : "";
  const entry = `${separator}# aiflow runtime state\n${requiredPattern}\n`;
  ensureDir(path.dirname(ignoreFile));
  fs.writeFileSync(ignoreFile, `${content}${entry}`, "utf8");
  writes.push(ignoreFile);
  return true;
}

function commandDoctor(parsed, io) {
  const root = io.cwd;
  const packageManager = detectPackageManager(root);
  const packageJson = readPackageJson(root);
  const scripts = packageJson?.scripts ?? {};
  const commands = detectCommands(scripts);
  const git = isGitRepo(root);
  const existingRules = detectAiRules(root);
  const ci = detectCi(root);
  const techStack = detectTechStack(root);
  const workspace = detectWorkspace(root);
  const openspec = inspectOpenSpec(root);
  const ruleConflicts = inspectRuleConflicts(root);
  const playwright = hasPlaywright(root);
  const missing = [];
  const risks = [];

  if (!exists(path.join(root, ".aiflow", "config.yaml"))) missing.push(".aiflow/config.yaml");
  if (!exists(path.join(root, "openspec"))) missing.push("openspec/");
  if (!exists(path.join(root, "AGENTS.md"))) missing.push("AGENTS.md");
  if (!exists(path.join(root, "TOOLS.md"))) missing.push("TOOLS.md");
  if (!git) risks.push("not_git_repository");
  if (!commands.test) risks.push("missing_test_command");
  if (!commands.typecheck) risks.push("missing_typecheck_command");
  if (ruleConflicts.length) risks.push("ai_rule_conflict");

  const mode = exists(path.join(root, ".git")) || exists(path.join(root, "package.json")) ? "legacy" : "new";
  const strictness = mode === "legacy" ? "standard" : "strict";

  io.stdout.write(lines([
    ok(`Found git repository: ${git ? "yes" : "no"}`),
    ok(`Found package manager: ${packageManager}`),
    commandLine("test", commands.test),
    commandLine("build", commands.build),
    commandLine("lint", commands.lint),
    commandLine("typecheck", commands.typecheck),
    ok(`CI: ${ci.length ? ci.join(", ") : "none"}`),
    ok(`Tech stack: ${techStack.length ? techStack.join(", ") : "unknown"}`),
    ok(`Playwright: ${playwright ? "available" : "not_found"}`),
    ok(`Workspace: ${workspace.type}`),
    workspace.files.length ? ok(`Workspace files: ${workspace.files.join(", ")}`) : "! Workspace files: none",
    workspace.packages.length ? ok(`Workspace packages: ${workspace.packages.join(", ")}`) : "! Workspace packages: none",
    `recommended_mode: ${mode}`,
    `recommended_strictness: ${strictness}`,
    `package_manager: ${packageManager}`,
    `commands: lint=${commands.lint?.command ?? "missing"}, typecheck=${commands.typecheck?.command ?? "missing"}, test=${commands.test?.command ?? "missing"}, build=${commands.build?.command ?? "missing"}`,
    `ci: ${ci.length ? ci.join(", ") : "none"}`,
    `workspace_packages: ${workspace.packages.length ? workspace.packages.join(", ") : "none"}`,
    `ui_testing: ${playwright ? "playwright" : "none"}`,
    `existing_ai_rules: ${existingRules.length ? existingRules.join(", ") : "none"}`,
    `openspec_compatibility: ${openspec.compatible ? "compatible" : "needs_attention"}`,
    openspec.issues.length ? `openspec_issues: ${openspec.issues.join("; ")}` : "openspec_issues: none",
    ruleConflicts.length ? `rule_conflicts: ${ruleConflicts.join("; ")}` : "rule_conflicts: none",
    `risks: ${risks.length ? risks.join(", ") : "none"}`,
    `missing_files: ${missing.length ? missing.join(", ") : "none"}`,
    "",
    "suggested_commands:",
    ...doctorSuggestions({ missing, mode, commands, playwright })
  ]));

  return EXIT.PASS;
}

function commandChange(parsed, io) {
  const action = parsed.positionals[1];
  if (action === "start") return changeStart(parsed, io);
  if (action === "status") return changeStatus(parsed, io);
  if (action === "list") return changeList(parsed, io);
  if (action === "approve") return changeApprove(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow change start|status|list|approve");
}

function changeStart(parsed, io) {
  const root = io.cwd;
  const topic = parsed.positionals[2];
  if (!topic) return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow change start <topic>");
  const slug = slugify(topic);
  const role = value(parsed, "role", "dev");
  const risk = value(parsed, "risk", "s1").toLowerCase();
  const hasUi = Boolean(parsed.flags.ui);

  if (!ROLES.has(role)) return fail(io, EXIT.CONFIG_ERROR, `Invalid role: ${role}`);
  if (!RISKS.has(risk)) return fail(io, EXIT.CONFIG_ERROR, `Invalid risk: ${risk}`);

  const configResult = loadConfig(root);
  if (!configResult.ok) return fail(io, EXIT.CONFIG_ERROR, configResult.error);

  const changeDir = path.join(root, "openspec", "changes", slug);
  ensureDir(changeDir);
  const writes = [];
  const files = {
    "proposal.md": templateProposal(slug),
    "design.md": templateDesign(slug),
    "tasks.md": templateTasks(slug),
    "pm.md": templateRole("PM", slug),
    "architect.md": templateRole("Architect", slug),
    "dev.md": templateRole("Dev", slug),
    "qa.md": templateRole("QA", slug),
    "release.md": templateRole("Release", slug),
    "ui.md": templateUi(slug, hasUi),
    "visual-validation.md": templateVisualValidation(slug),
    "approvals.md": "# Approvals\n\n"
  };

  for (const [name, content] of Object.entries(files)) {
    writeIfMissing(path.join(changeDir, name), content, writes);
  }

  const state = {
    active_change: slug,
    current_role: role,
    risk,
    status: "draft",
    ui_required: hasUi || configResult.config.ui === "required",
    last_check_at: "",
    last_check_result: ""
  };
  writeText(path.join(root, ".aiflow", "state", "current.yaml"), renderSimpleYaml(state));

  io.stdout.write(lines([
    ok(`Current change: ${slug}`),
    ok(`Current role: ${role}`),
    ok(`Risk: ${risk.toUpperCase()}`),
    hasUi ? ok("UI validation: required") : ok("UI validation: auto/off"),
    writes.length ? `Created:\n${writes.map((file) => `- ${relative(root, file)}`).join("\n")}` : "Reused existing change files.",
    ...(risk === "s2" || risk === "s3" ? ["", `Next: aiflow change approve ${slug} --risk ${risk}`] : [])
  ].filter(Boolean)));
  return EXIT.PASS;
}

function changeStatus(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const checks = collectChecks(root, context);
  io.stdout.write(renderStatus(context, checks));
  return checks.failures.length ? EXIT.CHECK_FAILED : EXIT.PASS;
}

function changeList(parsed, io) {
  const root = io.cwd;
  const changesDir = path.join(root, "openspec", "changes");
  if (!exists(changesDir)) return fail(io, EXIT.CONFIG_ERROR, "openspec/changes does not exist.");
  const entries = fs.readdirSync(changesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  io.stdout.write(entries.length ? `${entries.join("\n")}\n` : "No changes found.\n");
  return EXIT.PASS;
}

function changeApprove(parsed, io) {
  const root = io.cwd;
  const change = parsed.positionals[2] ?? loadState(root).active_change;
  if (!change) return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow change approve <change> --scope|--design|--risk s2");

  const risk = parsed.flags.risk ? String(parsed.flags.risk).toLowerCase() : "";
  const kind = parsed.flags.scope ? "Scope Approval" : parsed.flags.design ? "Design Approval" : risk ? "Risk Approval" : "Approval";
  if (risk && !RISKS.has(risk)) return fail(io, EXIT.CONFIG_ERROR, `Invalid risk: ${risk}`);

  const changeDir = path.join(root, "openspec", "changes", slugify(change));
  if (!exists(changeDir)) return fail(io, EXIT.CONFIG_ERROR, `Change not found: ${change}`);

  appendApproval(changeDir, {
    kind,
    risk_level: risk ? risk.toUpperCase() : "",
    scope: value(parsed, "scope-text", value(parsed, "scope", "current change")),
    reason: value(parsed, "reason", "human approval recorded"),
    command: `aiflow ${parsed.raw.join(" ")}`,
    commit: currentCommit(root)
  });

  io.stdout.write(ok(`${kind} recorded for ${slugify(change)}`) + "\n");
  return EXIT.PASS;
}

function commandCheck(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);

  const changed = resolveChangedFiles(root, parsed);
  const checks = collectChecks(root, context, changed.files);
  if (changed.error && changed.error !== "not_git") {
    checks.failures.push(`git diff failed: ${changed.error}`);
  }
  const result = renderCheck(context, checks, changed);
  io.stdout.write(result);

  updateState(root, {
    last_check_at: new Date().toISOString(),
    last_check_result: checks.failures.length ? "fail" : "pass"
  });
  writeText(path.join(root, ".aiflow", "state", "checks.yaml"), renderChecksState(context, checks));

  return checks.failures.length ? EXIT.CHECK_FAILED : EXIT.PASS;
}

function commandUi(parsed, io) {
  const action = parsed.positionals[1];
  if (action === "classify") return uiClassify(parsed, io);
  if (action === "verify") return uiVerify(parsed, io);
  if (action === "deviation") return uiDeviation(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow ui classify|verify|deviation add|list");
}

function uiClassify(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const ui = buildUiClassify(context);
  io.stdout.write(lines([
    `ui_source: ${ui.ui_source}`,
    `ui_target: ${ui.ui_target}`,
    `routes: ${ui.routes.length ? ui.routes.join(", ") : "none"}`,
    `viewports: ${ui.viewports.length ? ui.viewports.join(", ") : "desktop, tablet, mobile"}`
  ]));
  return EXIT.PASS;
}

function uiVerify(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const url = value(parsed, "url", "");
  const result = runUiVerify({ root, context, url });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function uiDeviation(parsed, io) {
  const subaction = parsed.positionals[2];
  if (subaction === "add") return uiDeviationAdd(parsed, io);
  if (subaction === "list") return uiDeviationList(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow ui deviation add --description <text> --reason <text> | aiflow ui deviation list");
}

function uiDeviationAdd(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const result = addUiDeviation({
    root,
    context,
    description: value(parsed, "description", parsed.positionals.slice(3).join(" ").trim()),
    reason: value(parsed, "reason", ""),
    acceptedBy: value(parsed, "accepted-by", "")
  });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function uiDeviationList(parsed, io) {
  const root = io.cwd;
  const result = listUiDeviations({ root });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function commandTest(parsed, io) {
  const action = parsed.positionals[1];
  if (action === "prompt") return testPrompt(parsed, io);
  if (action === "generate") return testGenerate(parsed, io);
  if (action === "approve") return testApprove(parsed, io);
  if (action === "run") return testRun(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow test prompt|generate|approve|run");
}

function testPrompt(parsed, io) {
  const result = writeAiTestBasePrompt({ root: io.cwd });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

async function testGenerate(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const result = await generateAiTestScenarios({
    root,
    context,
    sources: {
      requirements: value(parsed, "requirements", ""),
      page: value(parsed, "page", ""),
      uiBrief: value(parsed, "ui-brief", ""),
      constraints: value(parsed, "constraints", "")
    },
    out: value(parsed, "out", ""),
    ai: Boolean(parsed.flags.ai),
    apiUrl: value(parsed, "ai-url", ""),
    apiKey: value(parsed, "ai-key", ""),
    model: value(parsed, "model", "")
  });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function testApprove(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const scenarioFile = path.join(context.changeDir, "test-scenarios.yaml");
  if (!exists(scenarioFile)) return fail(io, EXIT.CONFIG_ERROR, "No test-scenarios.yaml found for the active change. Run aiflow test generate first.");
  appendApproval(context.changeDir, {
    kind: "Test Scenario Approval",
    risk_level: context.state.risk.toUpperCase(),
    scope: value(parsed, "scope-text", "AI generated test scenarios"),
    reason: value(parsed, "reason", "human reviewed test scenarios"),
    command: `aiflow ${parsed.raw.join(" ")}`,
    commit: currentCommit(root)
  });
  io.stdout.write(ok(`Test Scenario Approval recorded for ${context.state.active_change}`) + "\n");
  return EXIT.PASS;
}

function testRun(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const result = runTestScenarios({
    root,
    context,
    url: value(parsed, "url", ""),
    scenarioFile: value(parsed, "scenario", ""),
    reviewed: Boolean(parsed.flags.reviewed)
  });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function commandHandoff(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const checks = collectChecks(root, context);
  const content = renderHandoff(context, checks);
  const outPath = path.join(context.changeDir, "handoff.md");
  writeText(outPath, content);
  io.stdout.write(content);
  return EXIT.PASS;
}

function commandDelivery(parsed, io) {
  const action = parsed.positionals[1];
  if (action === "approve") return deliveryApprove(parsed, io);
  if (action === "prepare") return deliveryPrepare(parsed, io);
  if (action === "record") return deliveryRecord(parsed, io);
  if (action === "archive") return deliveryArchive(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow delivery approve|prepare|record|archive <change>");
}

function deliveryApprove(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const result = approveDelivery({ context, rawArgs: parsed.raw, reason: value(parsed, "reason", "delivery approved") });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function deliveryPrepare(parsed, io) {
  const root = io.cwd;
  const context = getContext(root);
  if (!context.ok) return fail(io, EXIT.CONFIG_ERROR, context.error);
  const checks = collectChecks(root, context);
  const result = prepareDelivery({ context, checks });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function deliveryArchive(parsed, io) {
  const root = io.cwd;
  const change = parsed.positionals[2];
  const result = archiveDelivery({
    root,
    change,
    rawArgs: parsed.raw,
    reason: value(parsed, "reason", "explicit archive command"),
    slugify
  });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function deliveryRecord(parsed, io) {
  const root = io.cwd;
  const change = parsed.positionals[2];
  const result = recordDeliveryAction({
    root,
    change,
    action: value(parsed, "action", ""),
    ref: value(parsed, "ref", ""),
    rawArgs: parsed.raw,
    reason: value(parsed, "reason", ""),
    slugify
  });
  if (result.error) io.stderr.write(result.error);
  if (result.message) io.stdout.write(result.message);
  return result.code;
}

function commandFollowup(parsed, io) {
  const action = parsed.positionals[1];
  if (action === "add") return followupAdd(parsed, io);
  if (action === "list") return followupList(parsed, io);
  return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow followup add <title> [--file path] [--reason text] | aiflow followup list");
}

function followupAdd(parsed, io) {
  const root = io.cwd;
  const title = parsed.positionals.slice(2).join(" ").trim();
  if (!title) return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow followup add <title> [--file path] [--reason text]");

  const state = loadState(root);
  const change = value(parsed, "change", state.active_change || "none");
  const file = value(parsed, "file", "n/a");
  const reason = value(parsed, "reason", "legacy technical debt follow-up");
  const entry = renderFollowupEntry({
    title,
    change,
    file,
    reason,
    commit: currentCommit(root)
  });
  const followups = path.join(root, ".aiflow", "artifacts", "follow-ups.md");
  ensureDir(path.dirname(followups));
  if (!exists(followups)) writeText(followups, "# Follow-ups\n\n");
  fs.appendFileSync(followups, entry, "utf8");
  io.stdout.write(ok(`Follow-up recorded: ${title}`) + "\n");
  io.stdout.write(`- ${relative(root, followups)}\n`);
  return EXIT.PASS;
}

function followupList(parsed, io) {
  const root = io.cwd;
  const followups = path.join(root, ".aiflow", "artifacts", "follow-ups.md");
  if (!exists(followups)) {
    io.stdout.write("No follow-ups recorded.\n");
    return EXIT.PASS;
  }
  io.stdout.write(fs.readFileSync(followups, "utf8"));
  return EXIT.PASS;
}

function renderFollowupEntry({ title, change, file, reason, commit }) {
  return `## ${title}

- change: ${change}
- file: ${file}
- reason: ${reason}
- recorded_at: ${new Date().toISOString()}
- commit: ${commit || "unknown"}

`;
}

function commandConfig(parsed, io) {
  const action = parsed.positionals[1];
  if (action !== "migrate") return fail(io, EXIT.CONFIG_ERROR, "Usage: aiflow config migrate");
  const root = io.cwd;
  const migration = inspectConfigMigration(root);
  if (!migration.ok) return fail(io, EXIT.CONFIG_ERROR, migration.error);
  const summary = migration.changes.length
    ? `Config migration would add:\n${migration.changes.map((item) => `- ${item}`).join("\n")}\n`
    : "Config is already at version 1. No migration needed.\n";
  if (parsed.flags.ci && !parsed.flags["allow-write"]) {
    io.stdout.write(summary);
    io.stdout.write("CI mode: No writes performed. Use --allow-write to permit migration.\n");
    return EXIT.PASS;
  }
  if (migration.changes.length) {
    writeText(migration.file, migration.nextText);
    io.stdout.write(summary);
    io.stdout.write("Config migration written.\n");
  } else {
    io.stdout.write(summary);
  }
  return EXIT.PASS;
}

function collectExistingWorkflowFiles(root) {
  return [
    "AGENTS.md",
    "TOOLS.md",
    "openspec",
    ".cursor/rules",
    ".github/copilot-instructions.md",
    "CLAUDE.md"
  ].filter((item) => exists(path.join(root, item)));
}

function writeInitMergeReport(root, existingFiles) {
  const conflicts = inspectRuleConflicts(root);
  const reportPath = path.join(root, ".aiflow", "artifacts", "init-merge-report.md");
  const content = `# Init Merge Report

Generated by \`aiflow init\`.

## Existing Files Preserved

${existingFiles.map((file) => `- ${file}`).join("\n")}

## Merge Policy

- Existing workflow and AI rule files were not overwritten.
- aiflow generated only missing files and directories.
- Review preserved files before enforcing stricter checks in CI.
- Keep existing project-specific rules, but make release, archive, MR, and merge explicit.

## Potential Conflicts

${conflicts.length ? conflicts.map((item) => `- ${item}`).join("\n") : "- none detected"}

## Suggested Next Steps

- Run \`aiflow doctor\` to review compatibility and risks.
- Merge aiflow workflow expectations into existing AI rule files where appropriate.
- Record project commands and AI tools in \`TOOLS.md\`.
- Keep historical OpenSpec content as-is; use the single business change model for new changes.
`;
  writeText(reportPath, content);
  return reportPath;
}

function getContext(root) {
  const configResult = loadConfig(root);
  if (!configResult.ok) return configResult;
  const state = loadState(root);
  const active = state.active_change || inferActiveChange(root);
  if (!active) return { ok: false, error: "No active change found. Run aiflow change start <topic>." };
  const changeDir = path.join(root, "openspec", "changes", active);
  if (!exists(changeDir)) return { ok: false, error: `Active change directory not found: ${relative(root, changeDir)}` };
  return {
    ok: true,
    root,
    config: configResult.config,
    state: {
      active_change: active,
      current_role: state.current_role || configResult.config.roles.current || "dev",
      risk: state.risk || "s1",
      status: state.status || "draft",
      ui_required: state.ui_required === true || state.ui_required === "true"
    },
    changeDir
  };
}

function renderHandoff(context, checks) {
  return `# Handoff

- current_change: ${context.state.active_change}
- current_role: ${context.state.current_role}
- risk: ${context.state.risk.toUpperCase()}
- status: ${context.state.status}

## Completed

- TODO: summarize completed work.

## Validation

- result: ${checks.failures.length ? "blocked" : "ready"}
- failures: ${checks.failures.length ? checks.failures.join("; ") : "none"}
- warnings: ${checks.warnings.length ? checks.warnings.join("; ") : "none"}

## UI Evidence

- visual_validation: ${exists(path.join(context.changeDir, "visual-validation.md")) ? "present" : "missing"}

## Next Role Input

- TODO: describe next role input.
`;
}

function inferActiveChange(root) {
  const changesDir = path.join(root, "openspec", "changes");
  if (!exists(changesDir)) return "";
  const entries = fs.readdirSync(changesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (!entries.length) return "";
  entries.sort((a, b) => fs.statSync(path.join(changesDir, b.name)).mtimeMs - fs.statSync(path.join(changesDir, a.name)).mtimeMs);
  return entries[0].name;
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { raw: argv, flags, positionals };
}

function value(parsed, key, fallback) {
  return parsed.flags[key] === true || parsed.flags[key] == null ? fallback : String(parsed.flags[key]);
}

function commandLine(name, command) {
  return command ? ok(`Found ${name} command: ${command.command}`) : `! Missing ${name} command`;
}

function doctorSuggestions({ missing, mode, commands, playwright }) {
  const suggestions = [];
  if (missing.length) suggestions.push(`- aiflow init --mode ${mode}`);
  if (!commands.test) suggestions.push("- add a test script before enforcing strict checks");
  if (!commands.typecheck) suggestions.push("- add a typecheck script when the project supports static typing");
  if (!playwright) suggestions.push("- add Playwright before requiring browser UI evidence");
  if (!suggestions.length) suggestions.push("- aiflow check");
  return suggestions;
}

function slugify(input) {
  return String(input).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "change";
}

function ok(text) {
  return `✓ ${text}`;
}

function lines(items) {
  return `${items.join("\n")}\n`;
}

function fail(io, code, message) {
  io.stderr.write(`${message}\n`);
  return code;
}

function helpText() {
  return `aiflow

Usage:
  npx aiflow-kit init
  aiflow --version
  aiflow version
  aiflow help
  aiflow init [--mode auto|new|legacy] [--strictness light|standard|strict] [--ui auto|required|off]
  aiflow doctor
  aiflow change start <topic> --role dev --risk s1 [--ui]
  aiflow change status
  aiflow change list
  aiflow change approve <change> --scope|--design|--risk s2
  aiflow check [--ci] [--base main|origin/main] [--staged] [--since HEAD~1]
  aiflow ui classify
  aiflow ui verify [--url http://localhost:3000]
  aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
  aiflow ui deviation list
  aiflow test prompt
  aiflow test generate [--ai] [--requirements file] [--page file] [--ui-brief file] [--constraints file] [--out file]
  aiflow test approve [--reason text]
  aiflow test run --url http://localhost:3000 [--scenario file] [--reviewed]
  aiflow handoff
  aiflow delivery approve
  aiflow delivery prepare
  aiflow delivery record <change> --action mr|merge|release --ref <value>
  aiflow delivery archive <change>
  aiflow followup add <title> [--file path] [--reason text]
  aiflow followup list
  aiflow config migrate [--ci] [--allow-write]
`;
}

function packageVersion(root) {
  const candidates = [
    new URL("../package.json", import.meta.url),
    path.join(root, "packages", "cli", "package.json")
  ];
  for (const candidate of candidates) {
    try {
      const text = candidate instanceof URL ? fs.readFileSync(candidate, "utf8") : fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(text);
      if (parsed.version) return parsed.version;
    } catch {
      // Try the next package location.
    }
  }
  return "0.0.0";
}
