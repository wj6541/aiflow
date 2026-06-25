# Changelog

All notable changes to this project will be documented here.

The format is based on Keep a Changelog, and this project intends to use semantic versioning after the first public release.

## 0.1.5 - 2026-06-25

### Added

- Added npm registry version preflight to prevent release checks from passing when the candidate package version already exists.
- Added explicit route and requirement records for the active productization change.

### Changed

- Tightened workflow gates for legacy changes without `route.yaml`, validation evidence artifacts, GitHub platform verification, Playwright runner module loading, and test-intent review requirements.

## 0.1.4 - 2026-06-10

### Added

- Added reviewed Playwright scenario quality gates requiring executable steps and `expect_*` assertions before browser execution.
- Added richer Playwright scenario evidence with base URL, scenario counts, step/assertion counts, timestamps, and screenshot paths.
- Added a local checkout UI example and reviewed scenario fixture for the click/fill/assert E2E workflow.
- Added read-only GitHub platform verification for PR state, base branch, HEAD alignment, check runs, review blockers, and mergeability.
- Added platform evidence artifacts under `.aiflow/artifacts/platform/` and active-change `platform-evidence.yaml` output.

### Changed

- Documented the reviewed scenario E2E loop and GitHub platform verification boundaries in repository and package docs.
- Included `platform.js` in workspace syntax checks and package smoke coverage.

## 0.1.3 - 2026-06-02

### Added

- Added change-centered route policy preview and `aiflow next` console guidance for required roles, missing gates, and recommended next commands.
- Added AI test intent review flow, command harness execution, Playwright scenario harness result files, and evidence records for harness outcomes.
- Added `aiflow evidence add` and `aiflow evidence list` for manually linked validation evidence.

### Changed

- Strengthened gate checks around requirement snapshots, architecture review, validation evidence, UI evidence, risk/scope/design approval, delivery approval, and release records.
- `aiflow next` now reports gate required/satisfied status across the delivery workflow instead of only a small subset of gates.
- High-risk routes now explicitly include design approval as a required route gate.

### Fixed

- Failed or invalid harness results now block checks.
- Strict/L3 validation gates now require a passed harness result or passed linked validation evidence.
- Non-validation evidence and validation records without linked artifacts no longer satisfy required validation evidence gates.

## 0.1.1 - 2026-05-28

### Added

- Added bilingual Chinese and English README content for the repository and npm package page.
- `aiflow init` now adds `.aiflow/state/*.yaml` to `.gitignore` so local runtime state stays out of commits while `.aiflow/config.yaml` remains committable team configuration.
- Added `npm run dogfood` to validate this repository with its own CLI plus package smoke testing.

### Changed

- Documented which aiflow YAML files are shared configuration and which are local runtime state.
- Documented one-command onboarding with `npx aiflow-kit init`.
- `aiflow init` now auto-detects legacy projects by default while still allowing explicit `--mode new` or `--mode legacy` overrides.

## 0.1.0 - 2026-05-28

### Added

- CLI commands for `init`, `doctor`, `change`, `check`, `ui`, `handoff`, `delivery`, `followup`, and `config migrate`.
- Single business change model under `openspec/changes/<topic>/`.
- Legacy incremental governance with `--base`, `--staged`, and `--since` diff scopes.
- S2/S3 scope, design, and risk approval checks.
- UI evidence artifacts, UI Brief checks, Playwright runner generation, and known deviation records.
- Explicit delivery approval, preparation, external action records, and archive behavior.
- Checks metadata snapshot at `.aiflow/state/checks.yaml`.
- Init merge report for existing AI rule and workflow files.
- Monorepo workspace package detection and touched package reporting.
- Config migration preview and guarded write behavior.
- `aiflow --version`, `aiflow version`, and `aiflow help`.
- Package tarball license inclusion.
- Security policy documentation.
- npm lockfile and CI `npm ci` setup.
- Node test coverage for CLI behavior and npm pack dry-run readiness.
- Package smoke test for installing the generated tarball and running the installed binary.

### Notes

- The first release is CLI-first and file-system based.
- GitHub/GitLab API integrations are intentionally not part of this version.
- UI verification records evidence but does not make aesthetic approval decisions.
