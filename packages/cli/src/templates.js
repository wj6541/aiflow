export function defaultAgents() {
  return `# AGENTS.md

This project uses aiflow for AI-assisted delivery workflow governance.

## Principles

- A change represents one business change.
- Roles are responsibility modes: PM, Architect, Dev, QA, Release, and UI.
- One person may hold multiple roles, but role outputs must be recorded separately.
- Validated does not mean released.
- Released does not mean archived.
- Release, archive, MR, and merge require explicit commands.

## Compatibility

This file is a project rule file for AI agents. It should coexist with Cursor rules,
Claude Code, Codex, Copilot, and other tool-specific instructions.
`;
}

export function defaultTools(packageManager) {
  const pm = packageManager === "unknown" ? "npm" : packageManager;
  return `# TOOLS.md

## Package Manager

${pm}

## Commands

- install: ${pm} install
- test: ${pm} test
- build: ${pm} build
- verify: ${pm} run verify

## Workflow Tool

- aiflow
`;
}

export function defaultProjectProfile() {
  return `# Project Profile

## Stack

TODO

## Commands

- install:
- test:
- build:
- verify:

## Existing Rules

TODO

## Legacy Notes

For legacy projects, aiflow governs only new changes and touched areas.
`;
}

export function defaultOpenSpecReadme() {
  return `# OpenSpec

This directory stores spec-driven change records managed by aiflow.

- \`changes/\`: business changes
- \`specs/\`: long-lived capabilities and system agreements
`;
}

export function templateProposal(slug) {
  return `# Proposal: ${slug}

## Why

TODO

## What Changes

TODO

## Scope

TODO

## Non-goals

TODO

## Impact

TODO
`;
}

export function templateDesign(slug) {
  return `# Design: ${slug}

## Approach

TODO

## Interfaces

TODO

## Data

TODO

## Compatibility

TODO

## Risk

TODO
`;
}

export function templateTasks(slug) {
  return `# Tasks: ${slug}

## Tasks

- [ ] TODO

## Validation

TODO
`;
}

export function templateRole(role, slug) {
  return `# ${role}: ${slug}

## Requirement Source

TODO

## Work Notes

TODO

## Risk

TODO

## Validation

TODO
`;
}

export function templateUi(slug, hasUi) {
  return `# UI: ${slug}

ui_source: ${hasUi ? "none" : "none"}
ui_target: product_usability

routes:
  - path: /

viewports:
  - desktop
  - tablet
  - mobile

## UI Brief

TODO
`;
}

export function templateVisualValidation(slug) {
  return `# Visual Validation: ${slug}

ui_source:
ui_target:

routes:
  - path:

viewports:
  - desktop
  - tablet
  - mobile

console_errors: pass | fail
responsive: pass | fail

known_deviations:
  - description:
    reason:
    accepted_by:
    accepted_at:
`;
}
