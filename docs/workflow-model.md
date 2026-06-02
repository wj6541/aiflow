# Workflow Model

One change represents one business change. Roles are responsibility modes inside that change.

`aiflow` is a change-centered workflow router, not a fixed PM -> Architect -> Dev -> QA -> Release pipeline and not a fully autonomous multi-agent executor.

Core boundary:

```text
AI plans. Harness proves. aiflow checks. Human accepts risk.
```

AI can draft requirements, test intent, scenarios, context packages, prompts, and next-step suggestions. AI output is not final acceptance evidence. Harness commands produce repeatable evidence. `aiflow check` verifies that evidence and approvals exist. Humans accept high-risk delivery, release, merge, publish, and archive risk explicitly.

AI-generated test intent is stored in `test-intent.yaml` with `human_review_required: true` and starts with `human_reviewed: false`. Review it with:

```bash
aiflow test review --reason "QA reviewed intent and scenario scope"
```

`aiflow test approve` remains as a compatibility alias for older scenario-review workflows.

Harness evidence is written by `aiflow test run`. It can run a normal project command or a reviewed browser scenario:

```bash
aiflow test run --command "npm test"
aiflow test run --url http://localhost:3000
```

```text
.aiflow/artifacts/tests/scenario-results.json
.aiflow/artifacts/tests/harness-result.json
.aiflow/artifacts/tests/harness-result.yaml
```

`aiflow check` reports whether harness evidence exists and passed. Failed harness evidence blocks the check; missing harness evidence is reported as metadata so existing lightweight changes remain compatible.
When a route declares `validation: required`, strict/L3 projects require passed harness evidence or linked passed validation evidence. Standard and light projects report missing evidence as a warning so teams can adopt the router incrementally.

Manual or external evidence can be linked to the change with:

```bash
aiflow evidence add --type validation --source manual --status passed --artifact .aiflow/artifacts/tests/manual.txt --note "QA checked acceptance criteria"
aiflow evidence list
```

Evidence records live in `openspec/changes/<change>/evidence.yaml`, while large artifacts stay under `.aiflow/artifacts/` or another project-owned artifact path.

## Change Model

New changes include route metadata:

```yaml
id: fix-repo-url
type: bugfix
entry_role: dev
current_role: dev
requirement_level: lightweight
risk: S1
ui_required: false
delivery_status: draft
```

`route.yaml` records the recommended workflow and gates:

```yaml
required:
  - dev
  - qa

optional:
  - architect
  - release

gates:
  requirement_snapshot: required
  architecture_review: optional
  validation: required
  ui_evidence: not_applicable
  release_record: optional
```

Routes are guidance and gate policy. They do not automatically execute roles or dangerous delivery actions.

`requirement_snapshot: required` means every entry path needs a minimum requirement snapshot. `aiflow intake` writes a concrete snapshot. `aiflow change start` writes a placeholder that must be completed before strict delivery checks pass. Standard and light projects report missing snapshots as warnings so existing teams can migrate without an abrupt block.

`architecture_review: required` means the change needs recorded architecture judgment in `architect.md`, `design.md`, or an explicit design/architecture approval. It does not dispatch an Architect agent or generate automatic approval.

`release_record: required` is reported in `check` and `next` as delivery readiness state. `aiflow next` may recommend explicit human commands such as `aiflow delivery approve` or `aiflow delivery prepare`, but it never performs release, merge, publish, or archive actions.

## Routing Commands

```bash
aiflow intake fix-repo-url --type bugfix --from dev --risk s1 --intent "Use configured repository URL before git remote fallback"
aiflow change start fix-repo-url --type bugfix --from dev --risk s1
aiflow route --type refactor --from dev --risk s2
aiflow next
aiflow context --role dev
aiflow prompt --role qa
```

`aiflow intake` records a requirement snapshot and recommended route without executing implementation work. `aiflow next` reports missing gates and recommended commands. It does not release, merge, publish, or archive. `aiflow context` and `aiflow prompt` write copyable role packages under `.aiflow/artifacts/`.

## Guardrails

The CLI keeps these product boundaries executable through tests and checks:

- Route policies are dynamic by change type; there is no single fixed linear workflow.
- Role files are governance records, not autonomous agent definitions.
- `aiflow next`, `context`, and `prompt` do not perform delivery actions.
- Dev-initiated changes still need a lightweight requirement snapshot before strict gates pass.
- Required architecture review is checked as a recorded human/role artifact, not as automatic agent execution.
- Release gates are surfaced as explicit human commands; they do not trigger release, merge, publish, or archive.
- `AI says passed` is not accepted as final validation evidence.
- Strict validation gates require passed harness or linked evidence, not only a written validation note.
- Harness or human-reviewed evidence must be linked separately when validation depends on AI-assisted reasoning.
- Release, merge, publish, and archive remain explicit human-triggered delivery actions.

Main statuses:

```text
draft
in_progress
implemented
validated
waiting_delivery
released
archived
blocked
```

`validated` does not mean `released`. `released` does not mean `archived`.

Checklist metadata is separate from the main status:

```yaml
checks:
  scope_required: true
  scope_approved: false
  design_required: true
  design_approved: false
  risk_approval_required: true
  risk_confirmed: false
  requirement_source_recorded: true
  validation_recorded: true
  ui_required: false
  ui_brief_required: false
  ui_validated: true
  delivery_prepared: false
```

`aiflow check` renders this metadata and writes the latest snapshot to `.aiflow/state/checks.yaml`.
