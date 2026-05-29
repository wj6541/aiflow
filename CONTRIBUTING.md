# Contributing

Thanks for helping improve aiflow.

## Development

```bash
npm ci
npm run check
```

The CLI entrypoint is:

```text
packages/cli/src/cli.js
```

Core behavior lives in small modules under `packages/cli/src/`. Tests live in:

```text
packages/cli/test/cli.test.js
```

## Workflow

Use the same workflow that aiflow enforces:

```bash
npx aiflow init --mode legacy
npx aiflow change start <topic> --role dev --risk s1
npx aiflow check
```

For higher-risk changes, record approvals before delivery:

```bash
npx aiflow change approve <change> --scope
npx aiflow change approve <change> --design
npx aiflow change approve <change> --risk s2
```

## Pull Requests

Before opening a PR:

- Run `npm run check`.
- Run `npm run release:check` before release-sensitive packaging changes.
- Update tests for behavior changes.
- Update docs when CLI commands, output, artifacts, or workflow rules change.
- Do not make release, archive, publish, or merge actions implicit.

## Compatibility

aiflow is designed to work with existing project rules and tools. Changes should preserve:

- OpenSpec-compatible change directories.
- Existing `AGENTS.md`, Cursor rules, Claude/Codex/Copilot conventions.
- Legacy incremental governance.
- Explicit release/archive behavior.
- CI non-interactive operation.
