# Config

`.aiflow/config.yaml`:

```yaml
version: 1
mode: legacy
strictness: standard
ui: auto
base_branch: main
package_manager: pnpm
roles:
  current: dev
legacy:
  level: L1
checks:
  require_source: true
  require_validation: true
  require_risk: true
  require_ui_evidence: auto
delivery:
  require_explicit_release: true
  require_explicit_archive: true
role_boundaries:
  dev:
    allow:
      - package.json
      - package-lock.json
```

Migration:

```bash
aiflow config migrate
aiflow config migrate --ci
aiflow config migrate --ci --allow-write
```

Migration checks `version: 1`, reports missing known fields, and preserves custom fields. CI mode is read-only unless `--allow-write` is passed.

Rules:

- Missing or unsupported `version` returns config error.
- `aiflow config migrate --ci` previews changes and performs no writes.
- `aiflow config migrate --ci --allow-write` writes missing v1 fields.
- Unknown custom fields are preserved.
- `role_boundaries.<role>.allow` appends allowed paths to the built-in role boundary defaults. Add `mode: override` under a role to replace the default allow list for that role.

State files:

```text
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
```

`current.yaml` stores active change, role, risk, status, and last check result. `checks.yaml` stores the latest checklist metadata written by `aiflow check`. State files are runtime hints, not the reviewable source of truth.

`aiflow init` adds `.aiflow/state/*.yaml` to `.gitignore` so these local runtime hints do not need to be filtered manually. Keep `.aiflow/config.yaml` committed because it is shared team configuration.
