import fs from "node:fs";
import path from "node:path";
import { EXIT } from "./constants.js";
import { updateState } from "./config.js";
import { exists, readText, writeText } from "./fs-utils.js";
import { currentCommit } from "./project.js";

export function approveDelivery({ context, rawArgs, reason }) {
  appendApproval(context.changeDir, {
    kind: "Delivery Approval",
    risk_level: context.state.risk?.toUpperCase() ?? "",
    scope: context.state.active_change,
    reason: reason || "delivery approved",
    command: `aiflow ${rawArgs.join(" ")}`,
    commit: currentCommit(context.root)
  });

  return {
    code: EXIT.PASS,
    message: `✓ Delivery approval recorded for ${context.state.active_change}\n`
  };
}

export function prepareDelivery({ context, checks }) {
  const content = renderDeliveryPrepare(context, checks);
  writeText(path.join(context.changeDir, "release.md"), content);
  updateState(context.root, { status: "waiting_delivery" });
  return {
    code: checks.failures.length ? EXIT.CHECK_FAILED : EXIT.PASS,
    message: content
  };
}

export function archiveDelivery({ root, change, rawArgs, reason, slugify }) {
  if (!change) {
    return { code: EXIT.UNSAFE_OPERATION, error: "Usage: aiflow delivery archive <change>\n" };
  }

  const slug = slugify(change);
  const changeDir = path.join(root, "openspec", "changes", slug);
  if (!exists(changeDir)) {
    return { code: EXIT.CONFIG_ERROR, error: `Change not found: ${change}\n` };
  }

  const approvals = readText(path.join(changeDir, "approvals.md"));
  if (!approvals.includes("Delivery Approval")) {
    return { code: EXIT.UNSAFE_OPERATION, error: "Archive blocked: run aiflow delivery approve first.\n" };
  }

  appendApproval(changeDir, {
    kind: "Archive Approval",
    risk_level: "S3",
    scope: slug,
    reason: reason || "explicit archive command",
    command: `aiflow ${rawArgs.join(" ")}`,
    commit: currentCommit(root)
  });
  updateState(root, { active_change: slug, status: "archived" });

  return {
    code: EXIT.PASS,
    message: `✓ Archived ${slug}\n`
  };
}

export function recordDeliveryAction({ root, change, action, ref, rawArgs, reason, slugify }) {
  if (!change) {
    return { code: EXIT.UNSAFE_OPERATION, error: "Usage: aiflow delivery record <change> --action mr|merge|release --ref <value>\n" };
  }

  const normalizedAction = String(action || "").toLowerCase();
  if (!["mr", "merge", "release"].includes(normalizedAction)) {
    return { code: EXIT.CONFIG_ERROR, error: "Invalid delivery action. Use --action mr|merge|release.\n" };
  }

  if (!ref) {
    return { code: EXIT.CONFIG_ERROR, error: "Missing --ref. Record the MR URL, merge commit, release tag, or deployment reference.\n" };
  }

  const slug = slugify(change);
  const changeDir = path.join(root, "openspec", "changes", slug);
  if (!exists(changeDir)) {
    return { code: EXIT.CONFIG_ERROR, error: `Change not found: ${change}\n` };
  }

  const approvals = readText(path.join(changeDir, "approvals.md"));
  if (!approvals.includes("Delivery Approval")) {
    return { code: EXIT.UNSAFE_OPERATION, error: "Delivery action blocked: run aiflow delivery approve first.\n" };
  }
  const releaseText = readText(path.join(changeDir, "release.md"));
  if (!releaseText.includes("# Delivery Prepare")) {
    return { code: EXIT.UNSAFE_OPERATION, error: "Delivery action blocked: run aiflow delivery prepare first.\n" };
  }
  if (hasIncompleteDeliveryItems(releaseText)) {
    return {
      code: EXIT.UNSAFE_OPERATION,
      error: [
        "Delivery action blocked: release.md still contains TODO, TBD, or 待补充.",
        `Next: complete openspec/changes/${slug}/release.md, then rerun aiflow delivery record.`
      ].join("\n") + "\n"
    };
  }

  const command = `aiflow ${rawArgs.join(" ")}`;
  appendApproval(changeDir, {
    kind: `Delivery Action: ${normalizedAction}`,
    risk_level: "S3",
    scope: `${slug}:${normalizedAction}`,
    reason: reason || `explicit ${normalizedAction} record`,
    command,
    commit: currentCommit(root)
  });

  appendReleaseAction(changeDir, {
    action: normalizedAction,
    ref,
    reason: reason || `explicit ${normalizedAction} record`,
    command
  });
  updateState(root, { active_change: slug, status: "released" });

  return {
    code: EXIT.PASS,
    message: `✓ Recorded ${normalizedAction} for ${slug}\n`
  };
}

export function appendApproval(changeDir, approval) {
  const file = path.join(changeDir, "approvals.md");
  const by = process.env.USER || process.env.USERNAME || "unknown";
  const block = `
## ${approval.kind}

- approved_by: ${by}
- approved_at: ${new Date().toISOString()}
- risk_level: ${approval.risk_level}
- scope: ${approval.scope}
- reason: ${approval.reason}
- command: ${approval.command}
- commit: ${approval.commit || "unknown"}
`;
  fs.appendFileSync(file, block, "utf8");
}

function appendReleaseAction(changeDir, action) {
  const file = path.join(changeDir, "release.md");
  const block = `
## Explicit Delivery Action: ${action.action}

- action: ${action.action}
- ref: ${action.ref}
- recorded_at: ${new Date().toISOString()}
- reason: ${action.reason}
- command: ${action.command}
`;
  fs.appendFileSync(file, block, "utf8");
}

function hasIncompleteDeliveryItems(text) {
  return /\b(?:TODO|TBD)\b|待补充/i.test(text);
}

function renderDeliveryPrepare(context, checks) {
  return `# Delivery Prepare

- change: ${context.state.active_change}
- risk: ${context.state.risk.toUpperCase()}
- status: waiting_delivery
- prepared_at: ${new Date().toISOString()}

## MR Summary

### What Changed

TODO: summarize user-visible and technical changes.

### Why

TODO: link requirement source and change motivation.

### Scope

TODO: list included scope and explicit non-goals.

## Validation

- result: ${checks.failures.length ? "blocked" : "ready"}
- failures: ${checks.failures.length ? checks.failures.join("; ") : "none"}

### Commands

TODO: list commands that were run.

### UI Evidence

TODO: link screenshots or explain why UI validation is not applicable.

## Risk

TODO: record remaining risks.

## Rollback

TODO: describe rollback or recovery path.

## Explicit Actions

- merge: not_triggered
- release: not_triggered
- archive: not_triggered

Use \`aiflow delivery record <change> --action mr|merge|release --ref <value>\` after an external delivery action is explicitly completed.
`;
}
