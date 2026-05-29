# Dev: aiflow CLI Productization

- Requirement Source: PLAN.md and user-requested implementation continuation.
- Changed Files: CLI source, tests, README, docs, examples, package metadata, CI workflow, and aiflow dogfood files.
- Risk: S1. The CLI is pre-release and does not automatically push, merge, release, archive, publish, or deploy.
- Implementation: added `aiflow --version`, `aiflow version`, and `aiflow help`.
- Implementation: included `packages/cli/LICENSE` in the published package files.
- Implementation: added `scripts/package-smoke.mjs` to test a real tarball install and installed bin execution.
- Implementation: added `npm run dogfood` so this repository validates itself with `aiflow doctor`, `aiflow check --ci`, and package smoke testing.
- Implementation: added fallback from configured local base branch to matching `origin/<branch>` ref.
- Implementation: added `package-lock.json` and updated CI install commands to `npm ci`.
- Validation: npm run check
- Validation: npm run pack:dry
- Validation: npm run smoke:package
- Validation: npm run release:check
