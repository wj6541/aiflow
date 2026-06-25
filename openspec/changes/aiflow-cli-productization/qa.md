# QA: aiflow CLI Productization

- Requirement Source: PLAN.md test plan.
- Validation: node test suite covers init, doctor, change, check, UI evidence, delivery gates, legacy diff scopes, config migration, package manager detection, monorepo behavior, Windows path normalization, and exit codes.
- Validation: CLI help exposes the full command surface, including version output.
- Regression: npm run check passes.
- Dogfood: npm run dogfood validates this repository with its own CLI and package smoke flow.
- Packaging: npm run pack:dry passes and includes `LICENSE` in the CLI package tarball.
- Packaging: npm run smoke:package passes by installing the tarball into a temporary consumer project.
- Security: SECURITY.md documents vulnerability reporting and local CLI security boundaries.
- Boundary: current_role is `qa`; this QA pass is reviewing and validating workflow-boundary hardening that includes source, docs, examples, and release-preflight changes from the active productization change.
- Boundary: QA validation does not mean aiflow executed release, publish, merge, or archive actions.
- Risk: final npm publish remains manual and outside normal check/handoff behavior.
