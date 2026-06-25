# Requirement Snapshot: aiflow-cli-productization

requirement_level: lightweight
source: user-approved workflow hardening plan

## Change Intent

Harden aiflow workflow checks so a passing result is less likely to hide missing route records, incomplete requirement snapshots, fake validation artifacts, already-published npm versions, unknown platform state, or mismatched Playwright setup.

## User Value

Users can trust aiflow's green checks as workflow evidence instead of only syntax/test success.

## Acceptance Criteria

- Current change records include an explicit route and requirement snapshot.
- Required route gates still apply when an older change is missing `route.yaml`.
- Linked validation evidence must point to a real local artifact or an explicit external URL.
- Release preflight fails when the npm package version already exists on the registry.
- GitHub platform verification fails closed for missing head SHA and unreported checks.
- Playwright runners work when either `playwright` or `@playwright/test` is the available module.
- Test-intent review gates are enforced when a route requires them.

## Non-goals

- Do not publish npm.
- Do not convert aiflow into an autonomous executor.
- Do not clean up or revert unrelated existing worktree changes.

## Risk

S1. The change tightens local CLI checks and release preflight behavior without triggering merge, publish, deployment, or archive actions.

## Impact Scope

CLI workflow checking, validation evidence parsing, GitHub platform verification, Playwright runner module loading, release preflight scripts, tests, and current OpenSpec change records.
