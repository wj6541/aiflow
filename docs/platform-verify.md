# Platform Verify

`aiflow platform verify` reads delivery state from a platform and records evidence locally.

The first provider is GitHub:

```bash
aiflow platform verify --provider github --pr https://github.com/org/repo/pull/123
```

For private repositories, provide a token through the environment:

```bash
GITHUB_TOKEN=... aiflow platform verify --provider github --pr https://github.com/org/repo/pull/123
```

You can make review expectations explicit:

```bash
aiflow platform verify --provider github --pr https://github.com/org/repo/pull/123 --base main --required-reviews 1
```

## What It Checks

- Pull request is open.
- Pull request is not draft.
- Base branch matches `--base` or the configured `base_branch`.
- PR head SHA matches local `HEAD` when the local repository has a commit.
- Combined commit status and check runs are passing.
- Latest reviewer states satisfy `--required-reviews`.
- No latest review state is `CHANGES_REQUESTED`.
- PR is not reported as unmergeable.

## What It Writes

```text
.aiflow/artifacts/platform/github-pr-<number>.json
.aiflow/artifacts/platform/github-pr-<number>.yaml
openspec/changes/<change>/platform-evidence.yaml
```

`platform-evidence.yaml` is written only when an active change exists.

## Boundaries

This command is read-only. It does not:

- create a PR
- approve a PR
- resolve review comments
- merge
- tag
- publish
- deploy
- archive

Use `aiflow delivery record` only after an external platform action has already been explicitly completed.

## Offline Fixtures

Tests and demos can use a saved snapshot instead of making network calls:

```bash
aiflow platform verify --provider github --from-file github-pr.json --base main --required-reviews 1
```
