# Workflow Model

One change represents one business change. Roles are responsibility modes inside that change.

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
