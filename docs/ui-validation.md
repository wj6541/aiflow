# UI Validation

UI changes must declare a source and target.

Sources:

```text
figma
screenshot
existing_product
design_system
text_spec
reference_product
none
```

Targets:

```text
design_restoration
visual_consistency
product_usability
```

`aiflow ui verify` creates visual validation artifacts and asks for a UI Brief when no design source exists. `aiflow check` requires the UI Brief sections to be completed; a scaffold full of TODO values is not enough.

When Playwright is available:

```bash
aiflow ui verify --url http://localhost:3000
```

The command captures screenshots for configured viewports and writes:

```text
.aiflow/artifacts/screenshots/
.aiflow/artifacts/ui/console-errors.json
.aiflow/artifacts/ui/responsive-check.json
.aiflow/artifacts/ui/known-deviations.md
```

Required UI Brief sections:

```text
Goal
Users
Layout
Key States
Style Source
Acceptance
```

Known deviations:

```bash
aiflow ui deviation add --description "Chart legend wraps on tablet" --reason "Accepted until chart library upgrade" --accepted-by qa
aiflow ui deviation list
```

Deviation entries are appended to `.aiflow/artifacts/ui/known-deviations.md` and the current change's `visual-validation.md`. The CLI records evidence; human reviewers decide whether the deviation is acceptable.

The repository includes a static example:

```bash
npm run example:ui
node packages/cli/src/cli.js ui verify --url http://localhost:4173
```
