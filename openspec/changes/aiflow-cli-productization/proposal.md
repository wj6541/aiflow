# Proposal: aiflow CLI Productization

## Motivation

Turn the aiflow plan into a usable open-source npm CLI that standardizes AI-assisted delivery records, checks, UI evidence, handoff, and explicit delivery actions.

## Goals

- Provide a CLI-first workflow for init, doctor, change, check, UI evidence, handoff, delivery, follow-up, and config migration.
- Keep the single business change model.
- Support legacy incremental governance.
- Support non-interactive CI checks.
- Keep release and archive actions explicit.

## Non-Goals

- Replace OpenSpec, Playwright, AGENTS.md, CI, or code review.
- Integrate deeply with GitHub/GitLab APIs in the first implementation.
- Make visual taste decisions automatically.

## Impact

- Adds a source-controlled CLI package under `packages/cli`.
- Adds documentation, examples, tests, and release preflight material.
- Dogfoods aiflow workflow files in this repository.
