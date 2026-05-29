# AGENTS.md

This repository uses aiflow to govern AI-assisted engineering work.

## Workflow

- A change represents one business change, not one role.
- Role outputs live under `openspec/changes/<topic>/`.
- One person may hold multiple roles, but PM, Architect, Dev, QA, Release, and UI records must stay separate.
- `validated` does not mean `released`.
- `released` does not mean `archived`.
- MR, merge, release, and archive actions must be explicit.

## Engineering

- Read the existing code structure before editing.
- Keep changes scoped to the current request.
- Do not overwrite existing project rules or user work.
- Prefer simple, maintainable Node.js implementations.
- Run `npm run check` before delivery.

## Compatibility

This file is an AI agent project rule file. It should coexist with Cursor rules, Claude Code, Codex, Copilot, and other tool-specific instructions.
