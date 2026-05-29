# Legacy Projects

Legacy mode uses incremental governance:

```text
Only govern new changes and touched areas.
Do not require historical code to become fully compliant.
```

Use one of:

```bash
npx aiflow-kit init
aiflow check --base main
aiflow check --base origin/main
aiflow check --staged
aiflow check --since HEAD~1
```

`npx aiflow-kit init` is the recommended onboarding command for existing projects because it does not require a separate install step before initialization. It auto-detects existing projects from `.git`, `package.json`, lockfiles, source folders, OpenSpec, or AI rule files. Pass `--mode legacy` to force legacy mode.

If `base_branch: main` is configured but the local `main` ref is missing, `aiflow check` falls back to `origin/main` when that remote ref exists. You can still pass `--base origin/main` explicitly.

Monorepo support:

- `aiflow doctor` reports workspace package roots detected from `package.json#workspaces` and `pnpm-workspace.yaml`.
- `aiflow check` reports touched packages for the current diff.
- Package-specific test/build routing remains project-configured in the first version.

When existing workflow files are present before initialization, `aiflow init --mode legacy` preserves them and writes:

```text
.aiflow/artifacts/init-merge-report.md
```

Use that report to merge aiflow expectations into existing AI rules without replacing project-specific rules.

Check strength:

```text
L0 / light
Findings are warnings.

L1-L2 / standard
Required records are failures. Role boundary issues are warnings.

L3 / strict
Required records and role boundary issues are failures.
```

Record historical debt as follow-ups instead of blocking the current change:

```bash
aiflow followup add "Refactor legacy auth module" --file src/auth/legacy.js --reason "out of scope for current fix"
aiflow followup list
```

Follow-ups are written to:

```text
.aiflow/artifacts/follow-ups.md
```
