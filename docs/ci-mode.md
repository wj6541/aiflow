# CI Mode

Use:

```bash
aiflow check --ci
```

GitHub Actions example:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npm run check
```

GitLab CI example:

```yaml
script:
  - npm ci
  - npm run check
```

For this repository, `npm run check` already includes `aiflow check --ci`. Projects that do not wrap it in their main check script can run `npx aiflow check --ci --base origin/main` as a separate CI step.

When `base_branch` is set to a local branch name such as `main`, `aiflow check` will try `origin/main` as a fallback if the local branch ref is not available. This keeps GitHub Actions pull request checkouts compatible with the default config.

Exit codes:

```text
0 = pass
1 = check failed
2 = config error
3 = missing dependency
4 = unsafe operation blocked
```

Covered boundaries:

- Missing config: `2`
- Unsupported config version: `2`
- Check failures: `1`
- Invalid git diff base or since ref: `1`
- Missing Playwright dependency for UI verification: `3`
- Unsafe archive usage: `4`

CI mode must not require interactive confirmation. Human approvals should be recorded before CI:

```bash
aiflow change approve payment-audit --scope
aiflow change approve payment-audit --design
aiflow change approve payment-audit --risk s2
aiflow delivery approve
```
