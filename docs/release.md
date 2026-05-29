# Release

Before publishing:

```bash
npm run release:check
```

Use `docs/release-checklist.md` as the final preflight checklist before publishing.

`npm run release:check` runs `npm run check`, `npm run pack:dry`, and `npm run smoke:package`.

`npm run smoke:package` creates a real tarball in a temporary directory, installs it into a temporary consumer project, runs the installed `aiflow` bin, and verifies `aiflow init --mode legacy`.

The package metadata should include:

- `repository`
- `homepage`
- `bugs`
- `keywords`
- `license`

`npm run pack:dry` uses a project-local npm cache so it does not depend on the current user's global npm cache permissions. If you need to run the underlying command manually:

```bash
npm pack --dry-run --workspace packages/cli --cache ./.npm-cache
```

Before preparing a project delivery:

```bash
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
```

`delivery prepare` writes an MR-ready release draft with validation, UI evidence, risk, rollback, and explicit action fields.

`delivery record` is for evidence after an external delivery action has already been explicitly completed. It requires `delivery approve` and `delivery prepare` first, then records the action in `approvals.md` and `release.md`, but it does not push, merge, tag, publish, or deploy.

The CLI package is `aiflow-kit`.

Publishing is intentionally manual:

```bash
npm publish --workspace packages/cli --access public
```

Do not automate release or archive from normal `check` or `handoff` commands.
