export const EXIT = {
  PASS: 0,
  CHECK_FAILED: 1,
  CONFIG_ERROR: 2,
  MISSING_DEPENDENCY: 3,
  UNSAFE_OPERATION: 4
};

export const ROLES = new Set(["pm", "architect", "dev", "qa", "release", "ui"]);

export const RISKS = new Set(["s0", "s1", "s2", "s3"]);

export const CHANGE_TYPES = new Set([
  "feature_request",
  "bugfix",
  "refactor",
  "docs",
  "test",
  "ui_change",
  "release"
]);

export const STATUSES = new Set([
  "draft",
  "in_progress",
  "implemented",
  "validated",
  "waiting_delivery",
  "released",
  "archived",
  "blocked"
]);

export const ROLE_FILE_ALLOW = {
  pm: ["docs/", "openspec/changes/"],
  architect: ["openspec/changes/", "openspec/specs/"],
  dev: ["apps/", "packages/", "db/", "infra/", "src/", "lib/", "docs/", "README.md", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", ".env.example", "openspec/changes/"],
  qa: ["test/", "tests/", "e2e/", "__tests__/", ".github/", ".gitlab-ci.yml", "openspec/changes/"],
  release: ["openspec/changes/", "CHANGELOG.md", "RELEASE.md"],
  ui: ["openspec/changes/", ".aiflow/artifacts/ui/", ".aiflow/artifacts/screenshots/"]
};

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 }
};
