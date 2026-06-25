# Release Checklist

This project keeps release actions explicit.

## Preflight

```bash
npm run release:check
```

Manual equivalent:

```bash
npm run check
npm run registry:check
npm run pack:dry
npm run smoke:package
```

`registry:check` verifies that `packages/cli/package.json` points to an npm package version that does not already exist.

The dry-run script uses a project-local npm cache. Underlying pack command:

```bash
npm pack --dry-run --workspace packages/cli --cache ./.npm-cache
```

## Package Metadata

Before a public release, verify:

- `packages/cli/package.json` has the correct `name`, `version`, `bin`, `license`, `repository`, `homepage`, and `bugs`.
- `README.md` and `packages/cli/README.md` show current commands.
- `CHANGELOG.md` has an entry for the release.
- Root `LICENSE` and `packages/cli/LICENSE` are present.
- `SECURITY.md` describes reporting and security boundaries.

## Manual Publish

Publishing is not automated by normal check or handoff commands.

```bash
npm publish --workspace packages/cli --access public
```

After publishing, record the external action:

```bash
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action release --ref <version>
```

Archive only when explicitly ready:

```bash
aiflow delivery archive <change>
```
