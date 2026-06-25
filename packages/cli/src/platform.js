import fs from "node:fs";
import path from "node:path";
import { EXIT } from "./constants.js";
import { ensureDir, readText, relative, writeText } from "./fs-utils.js";
import { currentCommit } from "./project.js";

const PASS_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

export async function verifyPlatform({ root, provider = "github", pr = "", fromFile = "", baseBranch = "", requiredReviews = 0, token = "", apiUrl = "", change = "" }) {
  const normalizedProvider = String(provider || "github").toLowerCase();
  if (normalizedProvider !== "github") {
    return {
      code: EXIT.CONFIG_ERROR,
      error: "Unsupported platform provider. Use --provider github.\n"
    };
  }

  let snapshot;
  if (fromFile) {
    const file = path.resolve(root, fromFile);
    if (!fs.existsSync(file)) {
      return { code: EXIT.CONFIG_ERROR, error: `Platform snapshot file not found: ${relative(root, file)}\n` };
    }
    snapshot = normalizeGithubSnapshot(JSON.parse(readText(file)));
  } else {
    const target = parseGithubPr(pr);
    if (!target.ok) return { code: EXIT.CONFIG_ERROR, error: `${target.error}\n` };
    const live = await fetchGithubSnapshot({ target, token, apiUrl });
    if (!live.ok) return { code: live.code, error: `${live.error}\n` };
    snapshot = normalizeGithubSnapshot(live.snapshot);
  }

  const result = evaluateGithubSnapshot({
    snapshot,
    root,
    baseBranch,
    requiredReviews: Number(requiredReviews || 0)
  });
  const artifact = writePlatformEvidence({ root, result, change });
  return {
    code: result.status === "passed" ? EXIT.PASS : EXIT.CHECK_FAILED,
    message: renderPlatformVerify(result, artifact, root)
  };
}

function parseGithubPr(input) {
  const text = String(input || "").trim();
  const url = text.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (url) {
    return { ok: true, owner: url[1], repo: url[2], number: Number(url[3]), htmlUrl: text };
  }
  const shorthand = text.match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/);
  if (shorthand) {
    return { ok: true, owner: shorthand[1], repo: shorthand[2], number: Number(shorthand[3]), htmlUrl: `https://github.com/${shorthand[1]}/${shorthand[2]}/pull/${shorthand[3]}` };
  }
  return {
    ok: false,
    error: "Usage: aiflow platform verify --provider github --pr https://github.com/<owner>/<repo>/pull/<number>"
  };
}

async function fetchGithubSnapshot({ target, token, apiUrl }) {
  const base = (apiUrl || "https://api.github.com").replace(/\/$/, "");
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "aiflow"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const request = async (url) => {
    const response = await fetch(url, { headers });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, code: EXIT.CHECK_FAILED, error: `GitHub request failed with HTTP ${response.status}: ${text}` };
    }
    return { ok: true, data: text ? JSON.parse(text) : null };
  };

  const repoPath = `/repos/${target.owner}/${target.repo}`;
  const pr = await request(`${base}${repoPath}/pulls/${target.number}`);
  if (!pr.ok) return pr;
  const sha = pr.data?.head?.sha || "";
  const [status, checkRuns, reviews] = await Promise.all([
    request(`${base}${repoPath}/commits/${sha}/status`),
    request(`${base}${repoPath}/commits/${sha}/check-runs`),
    request(`${base}${repoPath}/pulls/${target.number}/reviews`)
  ]);
  if (!status.ok) return status;
  if (!checkRuns.ok) return checkRuns;
  if (!reviews.ok) return reviews;

  return {
    ok: true,
    snapshot: {
      provider: "github",
      repository: `${target.owner}/${target.repo}`,
      number: target.number,
      url: pr.data?.html_url || target.htmlUrl,
      state: pr.data?.state,
      draft: Boolean(pr.data?.draft),
      base_branch: pr.data?.base?.ref || "",
      head_sha: sha,
      mergeable: pr.data?.mergeable,
      mergeable_state: pr.data?.mergeable_state || "",
      status_state: status.data?.state || "unknown",
      check_runs: Array.isArray(checkRuns.data?.check_runs) ? checkRuns.data.check_runs : [],
      reviews: Array.isArray(reviews.data) ? reviews.data : []
    }
  };
}

function normalizeGithubSnapshot(input) {
  const reviews = Array.isArray(input.reviews) ? input.reviews : [];
  const checkRuns = Array.isArray(input.check_runs) ? input.check_runs : Array.isArray(input.checks) ? input.checks : [];
  return {
    provider: "github",
    repository: String(input.repository || ""),
    number: input.number || input.pull_request || "",
    url: String(input.url || input.html_url || ""),
    state: String(input.state || "unknown"),
    draft: Boolean(input.draft),
    base_branch: String(input.base_branch || input.base?.ref || ""),
    head_sha: String(input.head_sha || input.head?.sha || ""),
    mergeable: input.mergeable,
    mergeable_state: String(input.mergeable_state || ""),
    status_state: String(input.status_state || input.status?.state || "unknown"),
    check_runs: checkRuns.map((item) => ({
      name: String(item.name || item.context || "unnamed"),
      status: String(item.status || (item.state === "success" ? "completed" : item.state || "unknown")),
      conclusion: String(item.conclusion || item.state || "unknown")
    })),
    reviews: reviews.map((item) => ({
      user: String(item.user?.login || item.user || item.author || "unknown"),
      state: String(item.state || "").toUpperCase(),
      submitted_at: String(item.submitted_at || item.submittedAt || "")
    }))
  };
}

function evaluateGithubSnapshot({ snapshot, root, baseBranch, requiredReviews }) {
  const localHead = currentCommit(root) || "";
  const targetBase = baseBranch || "";
  const latestReviews = latestReviewStates(snapshot.reviews);
  const approvals = [...latestReviews.values()].filter((state) => state === "APPROVED").length;
  const changesRequested = [...latestReviews.values()].filter((state) => state === "CHANGES_REQUESTED").length;
  const pendingChecks = snapshot.check_runs.filter((item) => item.status !== "completed");
  const failingChecks = snapshot.check_runs.filter((item) => item.status === "completed" && !PASS_CHECK_CONCLUSIONS.has(item.conclusion));
  const checksReported = snapshot.status_state !== "unknown" || snapshot.check_runs.length > 0;
  const statusPassed = snapshot.status_state === "success" || (snapshot.status_state === "unknown" && snapshot.check_runs.length > 0);
  const checkRunsPassed = pendingChecks.length === 0 && failingChecks.length === 0;
  const checksPassed = statusPassed && checkRunsPassed;
  const hasHeadSha = Boolean(snapshot.head_sha);
  const headMatches = hasHeadSha && commitsMatch(localHead, snapshot.head_sha);
  const baseMatches = !targetBase || snapshot.base_branch === targetBase;
  const requiredReviewsSatisfied = approvals >= requiredReviews && changesRequested === 0;
  const mergeable = snapshot.mergeable !== false;
  const failures = [];
  const warnings = [];

  if (snapshot.state !== "open") failures.push(`pull_request_not_open:${snapshot.state}`);
  if (snapshot.draft) failures.push("pull_request_is_draft");
  if (!baseMatches) failures.push(`base_branch_mismatch:${snapshot.base_branch || "unknown"}`);
  if (!hasHeadSha) failures.push("head_sha_missing");
  else if (!headMatches) failures.push("head_sha_mismatch");
  if (!checksReported) failures.push("checks_not_reported");
  if (!checksPassed) failures.push("checks_not_passed");
  if (!requiredReviewsSatisfied) failures.push("required_reviews_not_satisfied");
  if (!mergeable) failures.push("merge_conflict_or_not_mergeable");
  if (snapshot.mergeable == null) warnings.push("mergeable_state_unknown");

  return {
    provider: "github",
    status: failures.length ? "failed" : "passed",
    repository: snapshot.repository,
    pull_request: snapshot.number ? `#${snapshot.number}` : "unknown",
    url: snapshot.url,
    state: snapshot.state,
    draft: snapshot.draft,
    base_branch: snapshot.base_branch,
    base_branch_expected: targetBase || "not_configured",
    base_branch_matches: baseMatches,
    head_sha: snapshot.head_sha,
    local_head: localHead || "unknown",
    head_sha_matches: headMatches,
    checks_passed: checksPassed,
    status_state: snapshot.status_state,
    check_runs_total: snapshot.check_runs.length,
    check_runs_pending: pendingChecks.map((item) => item.name),
    check_runs_failing: failingChecks.map((item) => `${item.name}:${item.conclusion}`),
    approvals,
    changes_requested: changesRequested,
    required_reviews: requiredReviews,
    required_reviews_satisfied: requiredReviewsSatisfied,
    mergeable,
    mergeable_state: snapshot.mergeable_state || "unknown",
    failures,
    warnings,
    verified_at: new Date().toISOString()
  };
}

function commitsMatch(localHead, platformHead) {
  if (!localHead || !platformHead) return true;
  return platformHead.startsWith(localHead) || localHead.startsWith(platformHead);
}

function latestReviewStates(reviews) {
  const sorted = [...reviews].sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  const latest = new Map();
  for (const review of sorted) {
    if (review.state && review.state !== "COMMENTED") latest.set(review.user, review.state);
  }
  return latest;
}

function writePlatformEvidence({ root, result, change }) {
  const dir = path.join(root, ".aiflow", "artifacts", "platform");
  ensureDir(dir);
  const slug = `${result.provider}-pr-${String(result.pull_request).replace(/[^A-Za-z0-9._-]+/g, "") || "unknown"}`;
  const jsonPath = path.join(dir, `${slug}.json`);
  const yamlPath = path.join(dir, `${slug}.yaml`);
  writeText(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeText(yamlPath, renderPlatformYaml(result));
  if (change) {
    const evidencePath = path.join(root, "openspec", "changes", change, "platform-evidence.yaml");
    if (fs.existsSync(path.dirname(evidencePath))) writeText(evidencePath, renderPlatformYaml(result));
  }
  return { jsonPath, yamlPath };
}

function renderPlatformVerify(result, artifact, root) {
  const lines = [
    `${result.status === "passed" ? "✓" : "✗"} Platform verify: ${result.status}`,
    `provider: ${result.provider}`,
    `repository: ${result.repository || "unknown"}`,
    `pull_request: ${result.pull_request}`,
    `state: ${result.state}`,
    `base_branch_matches: ${result.base_branch_matches}`,
    `head_sha_matches: ${result.head_sha_matches}`,
    `checks_passed: ${result.checks_passed}`,
    `required_reviews_satisfied: ${result.required_reviews_satisfied}`,
    `mergeable: ${result.mergeable}`,
    `artifact: ${relative(root, artifact.yamlPath)}`
  ];
  if (result.failures.length) {
    lines.push("", "Failures:", ...result.failures.map((item) => `- ${item}`));
  }
  if (result.warnings.length) {
    lines.push("", "Warnings:", ...result.warnings.map((item) => `- ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

function renderPlatformYaml(result) {
  return [
    `provider: ${result.provider}`,
    `status: ${result.status}`,
    `repository: ${result.repository || "unknown"}`,
    `pull_request: ${result.pull_request}`,
    `url: ${result.url || "unknown"}`,
    `state: ${result.state}`,
    `draft: ${result.draft}`,
    `base_branch: ${result.base_branch || "unknown"}`,
    `base_branch_expected: ${result.base_branch_expected}`,
    `base_branch_matches: ${result.base_branch_matches}`,
    `head_sha: ${result.head_sha || "unknown"}`,
    `local_head: ${result.local_head}`,
    `head_sha_matches: ${result.head_sha_matches}`,
    `checks_passed: ${result.checks_passed}`,
    `status_state: ${result.status_state}`,
    `check_runs_total: ${result.check_runs_total}`,
    `approvals: ${result.approvals}`,
    `changes_requested: ${result.changes_requested}`,
    `required_reviews: ${result.required_reviews}`,
    `required_reviews_satisfied: ${result.required_reviews_satisfied}`,
    `mergeable: ${result.mergeable}`,
    `mergeable_state: ${result.mergeable_state}`,
    `verified_at: ${result.verified_at}`,
    "failures:",
    ...(result.failures.length ? result.failures.map((item) => `  - ${item}`) : ["  - none"]),
    "warnings:",
    ...(result.warnings.length ? result.warnings.map((item) => `  - ${item}`) : ["  - none"]),
    "artifacts:",
    ...result.check_runs_pending.map((item) => `  - pending_check: ${item}`),
    ...result.check_runs_failing.map((item) => `  - failing_check: ${item}`)
  ].join("\n") + "\n";
}
