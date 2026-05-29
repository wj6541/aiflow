# UI E2E Verification

The repository includes a static UI example:

```bash
npm run example:ui
```

In another terminal, initialize a temporary aiflow project state and run:

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
