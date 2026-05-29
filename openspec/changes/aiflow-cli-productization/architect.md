# Architect: aiflow CLI Productization

- Requirement Source: PLAN.md architecture and workflow model.
- Decision: keep the first implementation file-system based and npm CLI-first.
- Decision: use small Node.js modules instead of introducing a framework.
- Decision: keep OpenSpec files as the reviewable source and `.aiflow/state` as runtime state.
- Risk: adding hosted provider APIs too early would make the first version harder to adopt.
- Validation: architecture is represented in docs and covered by command-level tests.
