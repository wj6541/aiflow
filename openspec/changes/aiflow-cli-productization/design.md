# Design: aiflow CLI Productization

## Architecture

The CLI is implemented as small Node.js modules:

- `cli.js`: executable entrypoint.
- `core.js`: command routing and workflow orchestration.
- `config.js`: config, state, and migration helpers.
- `project.js`: project inspection, git, package manager, CI, and workspace detection.
- `check.js`: policy resolution and check rendering.
- `ui.js`: UI source, evidence, Playwright runner, and deviation records.
- `delivery.js`: approval, prepare, record, and archive behavior.
- `templates.js`: generated project and change files.

## Data Model

- `.aiflow/config.yaml` stores project policy.
- `.aiflow/state/` stores runtime snapshots and is ignored in this repository.
- `openspec/changes/<topic>/` stores reviewable change records.
- `.aiflow/artifacts/` stores generated evidence and is ignored in this repository.

## Compatibility

- Existing AGENTS.md, Cursor rules, Claude/Codex/Copilot rules, and OpenSpec content should be preserved.
- Legacy projects check only current diff scopes and touched areas.
- CI mode must not require interactive input.

## Risk

- Risk: users may mistake generated state for reviewable source.
- Mitigation: state and artifacts are treated as runtime outputs; OpenSpec files and approvals remain the reviewable source.
