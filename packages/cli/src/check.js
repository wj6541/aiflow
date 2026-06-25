import fs from "node:fs";
import path from "node:path";
import { ROLE_FILE_ALLOW, ROLES } from "./constants.js";
import { loadConfig } from "./config.js";
import { readEvidenceSummary } from "./evidence.js";
import { exists, normalizePath, readText } from "./fs-utils.js";
import { gitLinesResult, isGitRepo, touchedWorkspacePackages } from "./project.js";

export function collectChecks(root, context, changedFiles = []) {
  const policy = resolvePolicy(context.config);
  const failures = [];
  const warnings = [];
  const role = context.state.current_role;
  const roleFile = path.join(context.changeDir, `${role}.md`);
  const roleText = readText(roleFile);
  const architectText = readText(path.join(context.changeDir, "architect.md"));
  const designText = readText(path.join(context.changeDir, "design.md"));
  const tasksText = readText(path.join(context.changeDir, "tasks.md"));
  const requirementText = readText(path.join(context.changeDir, "requirement.md"));
  const approvals = readText(path.join(context.changeDir, "approvals.md"));
  const releaseText = readText(path.join(context.changeDir, "release.md"));
  const testScenariosText = readText(path.join(context.changeDir, "test-scenarios.yaml"));
  const testIntentText = readText(path.join(context.changeDir, "test-intent.yaml"));
  const harnessResult = readHarnessResult(root, context);
  const evidence = readEvidenceSummary(context.changeDir, root);
  const uiMeta = readUiMetadata(context.changeDir);
  const riskApprovalRequired = context.state.risk === "s2" || context.state.risk === "s3";
  const sourceRecorded = hasFilledField(roleText, ["Requirement source", "需求来源"]);
  const validationRecorded = hasFilledField(`${roleText}\n${tasksText}`, ["Validation", "验证"]);
  const aiOnlyValidationClaim = hasAiOnlyValidationClaim(`${roleText}\n${tasksText}`);
  const riskRecorded = hasFilledField(roleText, ["Risk", "风险"]);
  const requirementSnapshotRequired = routeRequiresRequirementSnapshot(context);
  const requirementSnapshotRecorded = hasRequirementSnapshot(requirementText);
  const architectureReviewRequired = routeRequiresGate(context, "architecture_review");
  const architectureReviewRecorded = hasArchitectureReview({ architectText, designText, approvals });
  const validationEvidenceRequired = routeRequiresGate(context, "validation");
  const validationEvidenceConfirmed = validationRecorded
    && (harnessResult.status === "passed" || (evidence.exists && evidence.passed && !evidence.failed));
  const scopeApprovalRecorded = approvals.includes("Scope Approval");
  const designApprovalRecorded = approvals.includes("Design Approval");
  const riskApprovalRecorded = approvals.includes("Risk Approval");
  const releaseRecordRequired = routeRequiresGate(context, "release_record");
  const deliveryApprovalRequired = routeRequiresGate(context, "delivery_approval") || releaseRecordRequired;
  const deliveryApproved = approvals.includes("Delivery Approval");
  const releaseRecordRecorded = /Delivery Action:\s*(mr|merge|release)/i.test(approvals);
  const uiCheckRequired = policy.requireUiEvidence || context.state.ui_required || uiMeta.ui_source !== "none";
  const uiEvidence = collectUiEvidence(context.changeDir, root);
  const uiEvidenceRecorded = uiEvidence.valid;
  const uiBriefRequired = uiCheckRequired && !uiEvidence.hasNonUiExplanation && requiresUiBrief(uiMeta);
  const uiBriefCompleted = !uiBriefRequired || hasCompletedUiBrief(root, context.changeDir);
  const deliveryPrepared = releaseText.includes("# Delivery Prepare");
  const aiTestScenariosPresent = testScenariosText.includes("source: ai_generated");
  const aiTestScenariosReviewRequired = !aiTestScenariosPresent || /human_review_required:\s*true\b/.test(testScenariosText);
  const aiTestIntentPresent = testIntentText.includes("source: ai_generated");
  const aiTestIntentReviewRequired = !aiTestIntentPresent || /human_review_required:\s*true\b/.test(testIntentText);
  const aiTestIntentReviewed = !aiTestIntentPresent
    || /human_reviewed:\s*true\b/.test(testIntentText)
    || approvals.includes("Test Intent Approval")
    || approvals.includes("Test Scenario Approval");
  const testIntentRouteReviewRequired = routeRequiresGate(context, "test_intent_review");
  const testIntentRouteReviewSatisfied = Boolean(testIntentText.trim()) && aiTestIntentReviewed;
  const metadata = {
    scope_required: riskApprovalRequired,
    scope_approved: !riskApprovalRequired || scopeApprovalRecorded,
    design_required: riskApprovalRequired,
    design_approved: !riskApprovalRequired || designApprovalRecorded,
    risk_approval_required: riskApprovalRequired,
    risk_confirmed: riskRecorded && (!riskApprovalRequired || riskApprovalRecorded),
    requirement_snapshot_required: requirementSnapshotRequired,
    requirement_snapshot_recorded: requirementSnapshotRecorded,
    architecture_review_required: architectureReviewRequired,
    architecture_review_recorded: architectureReviewRecorded,
    requirement_source_recorded: sourceRecorded,
    validation_recorded: validationRecorded,
    validation_evidence_required: validationEvidenceRequired,
    validation_evidence_confirmed: validationEvidenceConfirmed,
    ui_required: uiCheckRequired,
    ui_brief_required: uiBriefRequired,
    ui_validated: !uiCheckRequired || (uiEvidenceRecorded && uiBriefCompleted),
    ui_console_pass: uiEvidence.consolePass,
    ui_responsive_pass: uiEvidence.responsivePass,
    ui_screenshot_evidence: uiEvidence.hasScreenshots,
    ui_non_ui_explained: uiEvidence.hasNonUiExplanation,
    test_scenarios_human_review_required: aiTestScenariosReviewRequired,
    test_intent_exists: Boolean(testIntentText.trim()),
    test_intent_human_review_required: aiTestIntentReviewRequired,
    test_intent_human_reviewed: aiTestIntentReviewed,
    test_intent_review_required: testIntentRouteReviewRequired,
    test_intent_review_satisfied: !testIntentRouteReviewRequired || testIntentRouteReviewSatisfied,
    harness_result_exists: harnessResult.exists,
    harness_result_status: harnessResult.status || "missing",
    harness_result_passed: harnessResult.status === "passed",
    validation_evidence_linked: evidence.exists,
    validation_evidence_passed: evidence.passed && !evidence.failed,
    delivery_approval_required: deliveryApprovalRequired,
    delivery_approved: deliveryApproved,
    release_record_required: releaseRecordRequired,
    release_record_recorded: releaseRecordRecorded,
    delivery_prepared: deliveryPrepared
  };

  if (!ROLES.has(role)) failures.push(`Invalid current role: ${role}`);
  if (!exists(roleFile)) failures.push(`Missing role file: ${role}.md`);

  if (policy.requireSource && !sourceRecorded) {
    addFinding(policy.sourceSeverity, failures, warnings, "Missing requirement source");
  }

  if (policy.requireValidation && !validationRecorded) {
    addFinding(policy.validationSeverity, failures, warnings, "Missing validation record");
  }
  if (validationEvidenceRequired && validationRecorded && !validationEvidenceConfirmed) {
    addFinding(policy.validationEvidenceSeverity, failures, warnings, "Missing validation evidence");
  }
  if (validationRecorded && aiOnlyValidationClaim && !harnessResult.exists && !evidence.exists) {
    failures.push("AI validation claim is not final evidence");
  }

  if (policy.requireRisk && !riskRecorded) {
    addFinding(policy.riskSeverity, failures, warnings, "Missing risk record");
  }
  if (requirementSnapshotRequired && !requirementSnapshotRecorded) {
    addFinding(policy.requirementSnapshotSeverity, failures, warnings, "Missing requirement snapshot");
  }
  if (architectureReviewRequired && !architectureReviewRecorded) {
    addFinding(policy.architectureReviewSeverity, failures, warnings, "Missing architecture review");
  }

  if (riskApprovalRequired && !riskApprovalRecorded) {
    failures.push(`${context.state.risk.toUpperCase()} requires Risk Approval`);
  }
  if (riskApprovalRequired && !scopeApprovalRecorded) {
    failures.push(`${context.state.risk.toUpperCase()} requires Scope Approval`);
  }
  if (riskApprovalRequired && !designApprovalRecorded) {
    failures.push(`${context.state.risk.toUpperCase()} requires Design Approval`);
  }

  if (uiCheckRequired && !uiEvidenceRecorded) {
    addFinding(policy.uiSeverity, failures, warnings, "Missing UI validation evidence");
  }
  if (uiBriefRequired && !uiBriefCompleted) {
    addFinding(policy.uiSeverity, failures, warnings, "Missing completed UI Brief");
  }

  if (!aiTestScenariosReviewRequired) {
    failures.push("AI generated test scenarios require human_review_required: true");
  }
  if (!aiTestIntentReviewRequired) {
    failures.push("AI generated test intent requires human_review_required: true");
  }
  if (aiTestIntentPresent && aiTestIntentReviewRequired && !aiTestIntentReviewed) {
    failures.push("AI generated test intent requires human review");
  }
  if (testIntentRouteReviewRequired && !testIntentRouteReviewSatisfied) {
    failures.push("Route requires reviewed test intent");
  }
  if (harnessResult.exists && harnessResult.status === "failed") {
    failures.push("Harness result failed");
  }
  if (harnessResult.exists && harnessResult.status === "invalid") {
    failures.push("Harness result is invalid");
  }
  if (evidence.failed) {
    failures.push("Validation evidence failed");
  }
  if (harnessResult.exists && harnessResult.status === "not_run") {
    warnings.push("Harness result was not run");
  }

  if (changedFiles.length) {
    for (const file of changedFiles) {
      if (!isAllowedForRole(file, role, context.config)) {
        addFinding(policy.roleBoundarySeverity, failures, warnings, `Changed file may be outside ${role} role boundary: ${file}`);
      }
    }
  }

  return { failures, warnings, metadata };
}

export function resolveChangedFiles(root, parsed) {
  if (!isGitRepo(root)) {
    return withTouchedPackages(root, { mode: "none", files: [], warning: "Not a git repository; changed files check skipped.", error: "not_git" });
  }
  if (parsed.flags.staged) return withTouchedPackages(root, resultForGit("staged", gitLinesResult(root, ["diff", "--name-only", "--cached"])));
  if (parsed.flags.since) return withTouchedPackages(root, resultForGit(`since ${parsed.flags.since}`, gitLinesResult(root, ["diff", "--name-only", String(parsed.flags.since)])));
  const base = parsed.flags.base === true || parsed.flags.base == null
    ? (loadConfig(root).ok ? loadConfig(root).config.base_branch : "main")
    : String(parsed.flags.base);
  const resolvedBase = resolveBaseRef(root, base);
  if (!resolvedBase.ok) return withTouchedPackages(root, resultForGit(`base ${base}`, resolvedBase.result));
  const tripleDot = gitLinesResult(root, ["diff", "--name-only", `${resolvedBase.base}...HEAD`]);
  if (!tripleDot.ok) return withTouchedPackages(root, resultForGit(`base ${base}`, tripleDot));
  if (tripleDot.files.length) return withTouchedPackages(root, { mode: `base ${resolvedBase.base}`, files: tripleDot.files });
  return withTouchedPackages(root, resultForGit(`base ${resolvedBase.base}`, gitLinesResult(root, ["diff", "--name-only", resolvedBase.base])));
}

export function renderCheck(context, checks, changed) {
  const output = [
    ok(`Current change: ${context.state.active_change}`),
    ok(`Current role: ${context.state.current_role}`),
    ok(`Risk: ${context.state.risk.toUpperCase()}`),
    ok(`Status: ${context.state.status}`)
  ];
  if (changed?.warning) output.push(`! ${changed.warning}`);
  if (changed?.error) output.push(`! changed_files_error: ${changed.error}`);
  if (changed) output.push(ok(`Changed files mode: ${changed.mode}`), ok(`Changed files: ${changed.files.length}`));
  if (changed?.packages?.length) output.push(ok(`Touched packages: ${changed.packages.join(", ")}`));
  output.push(...renderMetadataLines(checks.metadata));
  for (const warning of checks.warnings) output.push(`! ${warning}`);
  for (const failure of checks.failures) output.push(bad(failure));
  if (!checks.failures.length) output.push(ok("All required checks passed"));
  if (checks.failures.length) {
    output.push("", "Next:");
    for (const failure of checks.failures) output.push(`- ${nextForFailure(context, failure)}`);
  }
  return lines(output);
}

export function renderStatus(context, checks) {
  return lines([
    `current_change: ${context.state.active_change}`,
    `current_role: ${context.state.current_role}`,
    `risk: ${context.state.risk}`,
    `status: ${context.state.status}`,
    "checks:",
    `  failures: ${checks.failures.length}`,
    `  warnings: ${checks.warnings.length}`,
    ...renderMetadataLines(checks.metadata).map((item) => `  ${item}`),
    checks.failures.length ? checks.failures.map((item) => `  - ${item}`).join("\n") : "  - pass"
  ]);
}

export function renderChecksState(context, checks) {
  return [
    `active_change: ${context.state.active_change}`,
    `current_role: ${context.state.current_role}`,
    `risk: ${context.state.risk}`,
    `status: ${context.state.status}`,
    `result: ${checks.failures.length ? "fail" : "pass"}`,
    `recorded_at: ${new Date().toISOString()}`,
    "checks:",
    ...Object.entries(checks.metadata ?? {}).map(([key, val]) => `  ${key}: ${val}`)
  ].join("\n") + "\n";
}

export function readUiMetadata(changeDir) {
  const text = readText(path.join(changeDir, "ui.md"));
  const source = matchField(text, "ui_source") || "none";
  const target = matchField(text, "ui_target") || targetForSource(source);
  const routes = [...text.matchAll(/path:\s*([^\n]+)/g)].map((match) => match[1].trim());
  const viewports = [...text.matchAll(/-\s*(desktop|tablet|mobile)\b/g)].map((match) => match[1].trim());
  return { ui_source: source, ui_target: target, routes, viewports };
}

export function hasFilledField(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|[-*]\\s*)${escapeRegex(label)}\\s*:?\\s*(.+)$`, "im");
    const match = text.match(pattern);
    if (match && match[1] && !/TODO|TBD|待补充|none/i.test(match[1])) return true;
  }
  return false;
}

function collectUiEvidence(changeDir, root) {
  const visual = readText(path.join(changeDir, "visual-validation.md"));
  const consoleJson = path.join(root, ".aiflow", "artifacts", "ui", "console-errors.json");
  const responsiveJson = path.join(root, ".aiflow", "artifacts", "ui", "responsive-check.json");
  const consoleResult = readJsonResult(consoleJson);
  const responsiveResult = readJsonResult(responsiveJson);
  const hasScreenshots = hasScreenshotEvidence(path.join(root, ".aiflow", "artifacts", "screenshots"));
  const hasNonUiExplanation = hasExplicitNonUiExplanation([
    visual,
    readText(path.join(changeDir, "ui.md"))
  ].join("\n"));
  const consolePass = consoleResult === "pass";
  const responsivePass = responsiveResult === "pass";
  return {
    valid: visual.includes("ui_source:") && consolePass && responsivePass && (hasScreenshots || hasNonUiExplanation),
    consolePass,
    responsivePass,
    hasScreenshots,
    hasNonUiExplanation
  };
}

function requiresUiBrief(uiMeta) {
  return uiMeta.ui_source === "none" || uiMeta.ui_source === "text_spec";
}

function hasCompletedUiBrief(root, changeDir) {
  const artifactBrief = readText(path.join(root, ".aiflow", "artifacts", "ui", "ui-brief.md"));
  const changeBrief = readText(path.join(changeDir, "ui.md"));
  const text = artifactBrief || changeBrief;
  return ["Goal", "Users", "Layout", "Key States", "Style Source", "Acceptance"].every((heading) => hasFilledSection(text, heading));
}

function hasAiOnlyValidationClaim(text) {
  return /(?:AI|LLM|模型)\s*(?:says|said|reports|reported|认为|表示)?\s*(?:pass|passed|通过)|(?:pass|passed|通过)\s*(?:by|from)?\s*(?:AI|LLM|模型)/i.test(String(text || ""));
}

function isAllowedForRole(file, role, config) {
  const normalized = normalizePath(file);
  const allowed = roleAllowedPaths(role, config);
  return allowed.some((prefix) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix));
}

function roleAllowedPaths(role, config) {
  const defaults = ROLE_FILE_ALLOW[role] ?? [];
  const boundary = config?.role_boundaries?.[role] ?? {};
  const configured = Array.isArray(boundary.allow) ? boundary.allow.map(normalizePath).filter(Boolean) : [];
  if (!configured.length) return defaults;
  const mode = String(boundary.mode || boundary.strategy || "append").toLowerCase();
  return mode === "override" ? configured : [...defaults, ...configured];
}

function readJsonResult(file) {
  if (!exists(file)) return "";
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return String(parsed.result || "");
  } catch {
    return "";
  }
}

function readHarnessResult(root, context) {
  const jsonPath = path.join(root, ".aiflow", "artifacts", "tests", "harness-result.json");
  if (!exists(jsonPath)) return { exists: false, status: "" };
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const sameChange = !parsed.change || parsed.change === context.state.active_change;
    return {
      exists: sameChange,
      status: sameChange ? String(parsed.status || "") : ""
    };
  } catch {
    return { exists: true, status: "invalid" };
  }
}

function hasScreenshotEvidence(screenshotsDir) {
  if (!exists(screenshotsDir)) return false;
  return fs.readdirSync(screenshotsDir).some((name) => /\.(png|jpe?g|webp)$/i.test(name));
}

function hasExplicitNonUiExplanation(text) {
  const match = String(text).match(/(?:non_ui_reason|ui_not_applicable_reason):\s*(.+)$/im);
  return Boolean(match?.[1]) && !/TODO|TBD|待补充|none/i.test(match[1]);
}

function targetForSource(source) {
  if (source === "figma") return "design_restoration";
  if (source === "screenshot" || source === "existing_product") return "visual_consistency";
  return "product_usability";
}

function matchField(text, field) {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function resolvePolicy(config) {
  const strictness = config.strictness || "standard";
  const legacyLevel = config.legacy?.level || (config.mode === "legacy" ? "L1" : "L3");
  const l0 = config.mode === "legacy" && legacyLevel === "L0";
  const strict = strictness === "strict" || legacyLevel === "L3";
  const light = strictness === "light" || l0;

  return {
    requireSource: config.checks.require_source !== false,
    requireValidation: config.checks.require_validation !== false,
    requireRisk: config.checks.require_risk !== false,
    requireUiEvidence: strict || config.checks.require_ui_evidence === true || config.checks.require_ui_evidence === "true" || config.ui === "required",
    sourceSeverity: light ? "warn" : "fail",
    validationSeverity: light ? "warn" : "fail",
    validationEvidenceSeverity: strict ? "fail" : "warn",
    riskSeverity: light ? "warn" : "fail",
    requirementSnapshotSeverity: strict ? "fail" : "warn",
    architectureReviewSeverity: light ? "warn" : "fail",
    uiSeverity: light ? "warn" : "fail",
    roleBoundarySeverity: strict ? "fail" : "warn"
  };
}

function addFinding(severity, failures, warnings, message) {
  if (severity === "fail") failures.push(message);
  else warnings.push(message);
}

function renderMetadataLines(metadata = {}) {
  return [
    "checks_metadata:",
    ...Object.entries(metadata).map(([key, val]) => `  ${key}: ${val}`)
  ];
}

function nextForFailure(context, failure) {
  if (failure.includes("requirement snapshot")) return `Fill openspec/changes/${context.state.active_change}/requirement.md or rerun aiflow intake with concrete intent, value, acceptance, non-goals, risk, and impact`;
  if (failure.includes("architecture review")) return `Record architecture review in openspec/changes/${context.state.active_change}/architect.md or run aiflow change approve ${context.state.active_change} --design`;
  if (failure.includes("requirement source")) return `Add requirement source to openspec/changes/${context.state.active_change}/${context.state.current_role}.md`;
  if (failure.includes("AI validation claim")) return "Run a harness command or link human-reviewed evidence; AI says passed is not final evidence";
  if (failure.includes("validation evidence")) return "Run aiflow test run --command <command> or link passed evidence with aiflow evidence add";
  if (failure.includes("validation")) return `Record validation result in openspec/changes/${context.state.active_change}/${context.state.current_role}.md`;
  if (failure.includes("risk")) return `Record risk notes in openspec/changes/${context.state.active_change}/${context.state.current_role}.md`;
  if (failure.includes("Risk Approval")) return `Run aiflow change approve ${context.state.active_change} --risk ${context.state.risk}`;
  if (failure.includes("Scope Approval")) return `Run aiflow change approve ${context.state.active_change} --scope`;
  if (failure.includes("Design Approval")) return `Run aiflow change approve ${context.state.active_change} --design`;
  if (failure.includes("UI Brief")) return "Fill .aiflow/artifacts/ui/ui-brief.md or provide a concrete UI source";
  if (failure.includes("UI")) return "Run aiflow ui classify and aiflow ui verify";
  if (failure.includes("AI generated test scenarios")) return `Add human_review_required: true to openspec/changes/${context.state.active_change}/test-scenarios.yaml before CI enforcement`;
  if (failure.includes("test intent requires human_review_required")) return `Add human_review_required: true to openspec/changes/${context.state.active_change}/test-intent.yaml before CI enforcement`;
  if (failure.includes("test intent requires human review")) return "Review the test intent, then run aiflow test review";
  if (failure.includes("reviewed test intent")) return "Run aiflow test generate, review the intent, then run aiflow test review";
  if (failure.includes("Harness result failed")) return "Inspect .aiflow/artifacts/tests/harness-result.yaml and rerun aiflow test run";
  if (failure.includes("Harness result is invalid")) return "Regenerate .aiflow/artifacts/tests/harness-result.json with aiflow test run";
  if (failure.includes("Validation evidence failed")) return `Inspect openspec/changes/${context.state.active_change}/evidence.yaml and rerun the failing harness`;
  if (failure.includes("git diff")) return "Check the --base or --since ref, then rerun aiflow check";
  return failure;
}

function hasFilledSection(text, heading) {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im");
  const match = text.match(pattern);
  if (!match) return false;
  const content = match[1].replace(/<!--[\s\S]*?-->/g, "").trim();
  return Boolean(content) && !/^(TODO|TBD|待补充|none)$/i.test(content);
}

function routeRequiresRequirementSnapshot(context) {
  return routeRequiresGate(context, "requirement_snapshot");
}

function routeRequiresGate(context, gateName) {
  return context.route?.gates?.[gateName] === "required";
}

function hasRequirementSnapshot(text) {
  return ["Change Intent", "User Value", "Acceptance Criteria", "Non-goals", "Risk", "Impact Scope"]
    .every((heading) => hasConcreteSection(text, heading));
}

function hasConcreteSection(text, heading) {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im");
  const match = String(text || "").match(pattern);
  if (!match) return false;
  const content = match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[-*]\s*/gm, "")
    .trim();
  return Boolean(content) && !/TODO|TBD|待补充|none/i.test(content);
}

function hasArchitectureReview({ architectText, designText, approvals }) {
  if (/Architecture Review|Design Approval/i.test(approvals)) return true;
  if (hasConcreteSection(architectText, "Work Notes") && hasConcreteSection(architectText, "Validation")) return true;
  return ["Approach", "Compatibility", "Risk"].every((heading) => hasConcreteSection(designText, heading));
}

function resultForGit(mode, result) {
  if (result.ok) return { mode, files: result.files };
  return { mode, files: [], error: result.error || "git diff failed" };
}

function resolveBaseRef(root, base) {
  const primary = gitLinesResult(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  if (primary.ok) return { ok: true, base };
  const fallback = fallbackBaseRef(base);
  if (!fallback) return { ok: false, result: primary };
  const fallbackResult = gitLinesResult(root, ["rev-parse", "--verify", `${fallback}^{commit}`]);
  if (fallbackResult.ok) return { ok: true, base: fallback };
  return { ok: false, result: primary };
}

function fallbackBaseRef(base) {
  return String(base).includes("/") ? "" : `origin/${base}`;
}

function withTouchedPackages(root, changed) {
  return { ...changed, packages: touchedWorkspacePackages(root, changed.files) };
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ok(text) {
  return `✓ ${text}`;
}

function bad(text) {
  return `✗ ${text}`;
}

function lines(items) {
  return `${items.join("\n")}\n`;
}
