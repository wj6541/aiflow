# UI E2E Verification

The repository includes a static UI example with a minimal checkout flow:

```bash
npm run example:ui
```

In another terminal, initialize a temporary aiflow project state and run UI evidence collection:

```bash
node packages/cli/src/cli.js init --mode new --ui required
node packages/cli/src/cli.js change start ui-example --role dev --risk s1 --ui
node packages/cli/src/cli.js ui verify --url http://localhost:4173
```

If Playwright is installed, the command writes:

```text
.aiflow/artifacts/screenshots/desktop.png
.aiflow/artifacts/screenshots/tablet.png
.aiflow/artifacts/screenshots/mobile.png
.aiflow/artifacts/ui/console-errors.json
.aiflow/artifacts/ui/responsive-check.json
```

If Playwright is not installed, the command exits with code `3` and writes the evidence scaffolds.

The automated test suite also covers the Playwright runner branch with a mocked Playwright module, so the CLI contract for screenshots and JSON reports is verified without downloading browser binaries.

## Reviewed Scenario E2E

`examples/ui-app/test-scenarios.yaml` is a reviewed-scenario starter file for the local checkout sample. It demonstrates the intended product loop:

1. An agent generates or drafts candidate scenarios.
2. A human reviews the route, selectors, assertions, and business meaning.
3. `aiflow test run --url` executes the reviewed scenario with Playwright.
4. `aiflow check` reads the harness evidence.

Example:

```bash
node packages/cli/src/cli.js change start checkout-sample --role qa --risk s1
cp examples/ui-app/test-scenarios.yaml openspec/changes/checkout-sample/test-scenarios.yaml
node packages/cli/src/cli.js test approve --reason "Reviewed local checkout sample scenario"
node packages/cli/src/cli.js test run --url http://localhost:4173
node packages/cli/src/cli.js check --ci
```

The runner intentionally supports a constrained action set:

```text
goto
fill
click
expect_text
expect_no_text
expect_url
expect_visible
```

Every scenario must include at least one executable step and at least one `expect_*` assertion. Relative `goto` paths are allowed; external `goto` URLs and arbitrary browser JavaScript are blocked.

Successful runs write:

```text
.aiflow/artifacts/tests/scenario-results.json
.aiflow/artifacts/tests/harness-result.json
.aiflow/artifacts/tests/harness-result.yaml
.aiflow/artifacts/tests/screenshots/
```

Verified fallback behavior:

```text
curl http://127.0.0.1:4173
# returns the example HTML

aiflow ui classify
# ui_source: none
# ui_target: product_usability

aiflow ui verify --url http://127.0.0.1:4173
# exits with code 3 when Playwright is not installed
# writes .aiflow/artifacts/ui/*.json and ui-brief.md
```
