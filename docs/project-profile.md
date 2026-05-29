# Project Profile

## Product

`aiflow` is a CLI-first workflow layer for spec-driven, AI-assisted team software delivery.

## Repository Shape

- npm workspace root
- CLI package under `packages/cli`
- Runtime templates under `packages/cli/templates`
- Documentation under `docs`
- Examples under `examples`

## Delivery Rules

- Keep OpenSpec-compatible change records.
- Keep legacy projects incremental by default.
- Keep UI source and validation evidence explicit.
- Keep release, archive, MR, and merge actions explicit.
- Do not make CI depend on interactive confirmation.
