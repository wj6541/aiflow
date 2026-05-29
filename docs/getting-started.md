# Getting Started

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
```

`aiflow` writes workflow evidence into `.aiflow/`, `openspec/`, and `docs/`.

`npx aiflow-kit init` auto-detects project type. Existing projects with `.git`, `package.json`, lockfiles, source folders, OpenSpec, or AI rule files use legacy mode. Empty directories use new-project mode. Pass `--mode legacy` or `--mode new` to override.

Pin the CLI as a project dev dependency when you want reproducible local and CI runs:

```bash
npm i -D aiflow-kit
```

The aiflow repository itself uses dogfood validation:

```bash
npm run dogfood
```

That script runs its own `aiflow doctor`, `aiflow check --ci`, and package smoke test.

For UI work:

```bash
npx aiflow change start dashboard --role dev --risk s1 --ui
npx aiflow ui verify --url http://localhost:3000
```
