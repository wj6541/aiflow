# aiflow

中文 | [English](#english)

CLI-first AI 交付流程工具，用于把 OpenSpec、AI agent 规则、CI、UI evidence（UI 证据）和显式交付动作组织成一套可落地的团队工作流。

`aiflow` 不替代 OpenSpec、Playwright、AGENTS.md、CI 或 code review（代码评审）。它的边界是做流程编排和交付检查，让 AI 辅助开发在真实项目里更可控。

## 一分钟开始

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
npx aiflow handoff
```

想把 CLI 固定到项目依赖里，再执行：

```bash
npm i -D aiflow-kit
```

示例输出：

```text
✓ Found package manager: pnpm
✓ Found test command: pnpm test
✓ Found build command: pnpm build
✓ Mode: legacy incremental
✓ Current change: fix-login
✓ Current role: dev
✓ Risk: S1

✗ Missing requirement source
✗ Missing validation record

Next:
- Add requirement source to openspec/changes/fix-login/dev.md
- Record validation result before handoff
```

## 它检查什么

- Requirement source（需求来源）
- Role boundary（角色边界）和 changed files（变更文件）
- Validation records（验证记录）
- Risk notes（风险记录）以及 S2/S3 risk、scope、design approvals（风险、范围、设计审批）
- Git diff base（差异基线）是否有效
- UI source（UI 来源）和 visual validation evidence（视觉验证证据）
- AI test generation prompt（AI 测试生成提示词）和 human review gate（人工确认门禁）
- 显式 delivery/archive（交付/归档）命令
- OpenSpec 结构兼容性
- CI、package manager（包管理器）、typecheck/test/build/lint 命令
- Playwright 可用性和常见前后端技术栈
- 可能与显式交付/归档冲突的 AI 规则

## 核心模型

一个 change（变更）代表一个业务变更，不代表一个角色：

```text
openspec/changes/<topic>/
  proposal.md
  design.md
  tasks.md
  pm.md
  architect.md
  dev.md
  qa.md
  release.md
  ui.md
  visual-validation.md
  approvals.md
```

Role（角色）是责任模式，不一定是不同的人。同一个人可以同时承担 PM、Architect、Dev、QA、Release、UI，但不同责任的记录必须分开。

## 命令

```bash
aiflow --version
aiflow version
aiflow help
aiflow init [--mode auto|new|legacy] [--strictness light|standard|strict] [--ui auto|required|off]
aiflow doctor
aiflow change start <topic> --role dev --risk s1 [--ui]
aiflow change status
aiflow change list
aiflow change approve <change> --scope|--design|--risk s2
aiflow check [--ci] [--base main|origin/main] [--staged] [--since HEAD~1]
aiflow ui classify
aiflow ui verify [--url http://localhost:3000]
aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
aiflow ui deviation list
aiflow test prompt
aiflow test generate [--ai] [--requirements file] [--page file] [--ui-brief file] [--constraints file] [--out file]
aiflow test approve [--reason text]
aiflow test run --url http://localhost:3000 [--scenario file] [--reviewed]
aiflow handoff
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
aiflow followup add <title> [--file path] [--reason text]
aiflow followup list
aiflow config migrate [--ci] [--allow-write]
```

`aiflow init` 不会覆盖已有流程文件。遇到已有 `AGENTS.md`、`TOOLS.md`、`openspec/`、`.cursor/rules` 或相关 AI 规则文件时，它会写入 `.aiflow/artifacts/init-merge-report.md`，记录保留文件、潜在冲突和合并建议。

## 文档

- `docs/getting-started.md`：本地接入和第一条流程
- `docs/project-profile.md`：项目画像和交付规则
- `docs/legacy-projects.md`：老项目增量治理
- `docs/workflow-model.md`：角色、状态、检查、风险等级和显式交付
- `docs/ui-validation.md`：UI 来源、UI Brief、截图、响应式检查和偏差记录
- `docs/ui-e2e.md`：静态 UI 示例的本地浏览器证据流程
- `docs/ci-mode.md`：非交互检查和 CI exit codes（退出码）
- `docs/config.md`：配置、状态结构和迁移行为
- `docs/release.md`：发布行为和 npm 包说明
- `docs/release-checklist.md`：发布前检查清单
- `CONTRIBUTING.md`：贡献流程和兼容性预期
- `SECURITY.md`：漏洞报告和安全边界
- `CHANGELOG.md`：发布记录

## 包信息

npm 包名：

```text
aiflow-kit
```

命令入口：

```bash
npx aiflow-kit --version
aiflow --version
```

模板文件位于：

```text
packages/cli/templates/
```

CLI runtime（运行时代码）拆分为：

```text
src/constants.js
src/config.js
src/fs-utils.js
src/project.js
src/check.js
src/ui.js
src/delivery.js
src/templates.js
src/core.js
src/cli.js
```

## Exit codes（退出码）

```text
0 = pass
1 = check failed
2 = config error
3 = missing dependency
4 = unsafe operation blocked
```

## CI

GitHub Actions 配置在 `.github/workflows/ci.yml`，使用 Node 20，执行 `npm ci`，然后执行 `npm run release:check`。

GitLab CI 示例在：

```text
docs/gitlab-ci.example.yml
```

`aiflow check --ci` 不会请求交互输入，并通过 exit codes（退出码）报告失败原因。

`aiflow check` 会写入 `.aiflow/state/checks.yaml` 作为最新 checklist snapshot（检查快照）。它只是运行时状态；真正可评审的来源仍然是 `openspec/changes/<change>/` 和 `approvals.md`。

`aiflow init` 会自动把 `.aiflow/state/*.yaml` 写入 `.gitignore`，避免把本地 runtime state（运行状态）提交到仓库；`.aiflow/config.yaml` 仍然应该提交，因为它是团队共享配置。

`aiflow delivery record` 只记录已经在外部显式完成的 MR、merge 或 release（合并请求、合并、发布）动作。它不会调用 GitHub、GitLab、npm 或生产系统。

`aiflow config migrate --ci` 只预览配置迁移，不写文件。使用 `--allow-write` 才会补齐缺失的 v1 字段，并保留自定义字段。

## AI 测试场景生成

`aiflow test prompt` 会把团队统一的 AI 测试生成基础提示词写入：

```text
.aiflow/artifacts/tests/ai-test-base-prompt.md
```

`aiflow test generate` 会基于当前 active change 汇总需求、页面信息、UI Brief 和测试约束，生成可交给 AI 执行的测试场景请求包。加上 `--ai` 后，会调用兼容的 AI endpoint 生成场景 YAML：

```bash
aiflow test generate
aiflow test generate --ai --requirements req.md --page page.md --ui-brief brief.md --constraints constraints.md
```

产物包括：

```text
.aiflow/artifacts/tests/<change>-test-generation-prompt.md
openspec/changes/<change>/test-scenarios.yaml
```

如果输入仍是 TODO、占位符或缺失信息，命令会返回检查失败并写出 `missing_info` 和空 `scenarios: []`，不会编造页面流程。所有 AI 生成的 scenario 产物都会标记：

```yaml
source: ai_generated
human_review_required: true
```

AI 场景生成后，需要显式确认再执行页面自动化：

```bash
aiflow test approve --reason "QA reviewed selectors and assertions"
aiflow test run --url http://localhost:3000
```

`aiflow test run` 会读取 `openspec/changes/<change>/test-scenarios.yaml`，使用 Playwright 按 scenario 中的 `goto`、`fill`、`click`、`expect_text`、`expect_url` 等步骤执行，并写出：

```text
.aiflow/artifacts/tests/scenario-results.json
.aiflow/artifacts/tests/screenshots/
```

发布前运行：

```bash
npm run release:check
```

本仓库会 dogfood（自用验证）自己的 CLI：

```bash
npm run dogfood
```

这会运行本项目的 `aiflow doctor`、`aiflow check --ci` 和 package smoke（包冒烟测试）。

## 一条命令接入

用户不需要先安装再初始化。老项目可以直接运行：

```bash
npx aiflow-kit init
```

这会自动判断项目类型：有 `.git`、`package.json`、锁文件、源码目录、已有 OpenSpec 或 AI 规则时按 legacy（老项目）接入；空目录按 new（新项目）接入。它会创建/补齐 `.aiflow/config.yaml`、`AGENTS.md`、`TOOLS.md`、`docs/project-profile.md`、`openspec/README.md`，并自动把 `.aiflow/state/*.yaml` 加入 `.gitignore`。已有流程文件不会被覆盖。

需要手动覆盖时可以显式传入：

```bash
npx aiflow-kit init --mode legacy
npx aiflow-kit init --mode new
```

之后可以继续用：

```bash
npx aiflow doctor
npx aiflow check --staged
```

## 老项目

Legacy projects（老项目）使用增量治理：

```text
Only govern new changes and touched areas.
Do not require all historical code to become compliant.
```

Diff scopes（差异范围）：

```bash
aiflow check --base main
aiflow check --base origin/main
aiflow check --staged
aiflow check --since HEAD~1
```

在 monorepo（多包仓库）中，`aiflow doctor` 会报告检测到的 workspace package roots（工作区包根目录），`aiflow check` 会报告当前 diff（差异）触碰到的 packages（包）。

历史债务可以记录为 follow-up（后续事项），不阻塞当前 change：

```bash
aiflow followup add "Refactor legacy auth module" --file src/auth/legacy.js --reason "out of scope"
aiflow followup list
```

Follow-ups 会写入 `.aiflow/artifacts/follow-ups.md`。

## UI 验证

UI changes（UI 变更）必须声明 source（来源）：

```text
figma
screenshot
existing_product
design_system
text_spec
reference_product
none
```

Targets（目标）：

```text
design_restoration
visual_consistency
product_usability
```

如果没有设计来源，`aiflow ui verify` 会创建 UI Brief（UI 简报）模板。`aiflow check` 会要求 Brief 中的关键部分填写完成后，UI 检查才会通过。

当 Playwright 可用时，可以传入 `--url` 采集浏览器证据：

```bash
aiflow ui verify --url http://localhost:3000
```

它会把截图和 JSON report（报告）写入 `.aiflow/artifacts/`。

Known visual deviations（已知视觉偏差）可以单独记录，不代表 CLI 自动做审美判断：

```bash
aiflow ui deviation add --description "Chart legend wraps on tablet" --reason "Accepted until chart library upgrade" --accepted-by qa
aiflow ui deviation list
```

静态 UI 示例：

```bash
npm run example:ui
# in another terminal
node packages/cli/src/cli.js ui verify --url http://localhost:4173
```

完整本地验证流程见 `docs/ui-e2e.md`。

## Strictness（严格度）

`strictness` 和 legacy level（老项目等级）控制问题是 warning（警告）还是 failure（失败）：

```text
legacy L0 / light  -> missing records are warnings
standard / L1-L2   -> required records are failures, role boundary is warning
strict / L3        -> required records and role boundary violations are failures
```

## License（许可证）

MIT

---

## English

CLI-first workflow layer for spec-driven, AI-assisted team software delivery.

`aiflow` does not replace OpenSpec, Playwright, AGENTS.md, CI, or code review. It orchestrates them into a practical team workflow for AI-assisted development.

## One-minute Demo

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
npx aiflow handoff
```

To pin the CLI as a project dev dependency, run:

```bash
npm i -D aiflow-kit
```

## What It Checks

- Requirement source
- Role boundary and changed files
- Validation records
- Risk notes and S2/S3 risk, scope, and design approvals
- Git diff base validity for incremental legacy checks
- UI source and visual validation evidence
- AI test generation prompt and human review gate
- Explicit delivery/archive commands
- OpenSpec structure compatibility
- CI, package manager, typecheck/test/build/lint commands
- Playwright availability and common frontend/backend tech stack
- AI rules that may conflict with explicit delivery/archive

## Core Model

One change represents one business change:

```text
openspec/changes/<topic>/
  proposal.md
  design.md
  tasks.md
  pm.md
  architect.md
  dev.md
  qa.md
  release.md
  ui.md
  visual-validation.md
  approvals.md
```

Roles are responsibility modes, not necessarily different people. The same person can act as PM, Architect, Dev, QA, Release, and UI, but each responsibility must be recorded separately.

## Commands

```bash
aiflow --version
aiflow version
aiflow help
aiflow init [--mode auto|new|legacy] [--strictness light|standard|strict] [--ui auto|required|off]
aiflow doctor
aiflow change start <topic> --role dev --risk s1 [--ui]
aiflow change status
aiflow change list
aiflow change approve <change> --scope|--design|--risk s2
aiflow check [--ci] [--base main|origin/main] [--staged] [--since HEAD~1]
aiflow ui classify
aiflow ui verify [--url http://localhost:3000]
aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
aiflow ui deviation list
aiflow test prompt
aiflow test generate [--ai] [--requirements file] [--page file] [--ui-brief file] [--constraints file] [--out file]
aiflow test approve [--reason text]
aiflow test run --url http://localhost:3000 [--scenario file] [--reviewed]
aiflow handoff
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
aiflow followup add <title> [--file path] [--reason text]
aiflow followup list
aiflow config migrate [--ci] [--allow-write]
```

`aiflow init` does not overwrite existing workflow files. When it finds existing `AGENTS.md`, `TOOLS.md`, `openspec/`, `.cursor/rules`, or related AI rule files in an uninitialized project, it writes `.aiflow/artifacts/init-merge-report.md` with preserved files, potential conflicts, and merge suggestions.

## Documentation

- `docs/getting-started.md`: local setup and first workflow.
- `docs/project-profile.md`: repository profile and delivery rules.
- `docs/legacy-projects.md`: incremental governance for existing projects.
- `docs/workflow-model.md`: roles, statuses, checks, risk levels, and explicit delivery.
- `docs/ui-validation.md`: UI source, UI Brief, screenshots, responsive checks, and deviations.
- `docs/ui-e2e.md`: local browser evidence flow for the static UI example.
- `docs/ci-mode.md`: non-interactive checks and CI exit codes.
- `docs/config.md`: config/state schema and migration behavior.
- `docs/release.md`: release behavior and package publishing notes.
- `docs/release-checklist.md`: preflight checklist before publishing.
- `CONTRIBUTING.md`: contribution workflow and compatibility expectations.
- `SECURITY.md`: vulnerability reporting and security boundaries.
- `CHANGELOG.md`: release notes.

## Package Metadata

The npm package is published as:

```text
aiflow-kit
```

It installs the `aiflow` command:

```bash
npx aiflow-kit --version
aiflow --version
```

## CI

GitHub Actions is configured in `.github/workflows/ci.yml`. It uses Node 20, runs `npm ci`, then runs `npm run release:check`.

GitLab example:

```text
docs/gitlab-ci.example.yml
```

`aiflow check --ci` never prompts for interactive input and reports failures with exit codes.

`aiflow init` adds `.aiflow/state/*.yaml` to `.gitignore` so local runtime state stays out of commits. Keep `.aiflow/config.yaml` committed because it is shared team configuration.

Before publishing the package:

```bash
npm run release:check
```

This repository dogfoods its own CLI:

```bash
npm run dogfood
```

It runs this repository's `aiflow doctor`, `aiflow check --ci`, and package smoke test.

## One-command Onboarding

Users do not need to install first and initialize second. Existing projects can run:

```bash
npx aiflow-kit init
```

This auto-detects the project type: directories with `.git`, `package.json`, lockfiles, source folders, existing OpenSpec, or AI rule files are initialized as legacy projects; empty directories are initialized as new projects. It creates or fills `.aiflow/config.yaml`, `AGENTS.md`, `TOOLS.md`, `docs/project-profile.md`, and `openspec/README.md`, then adds `.aiflow/state/*.yaml` to `.gitignore`. Existing workflow files are preserved.

You can still override the detection explicitly:

```bash
npx aiflow-kit init --mode legacy
npx aiflow-kit init --mode new
```

## Legacy Projects

Legacy projects use incremental governance:

```text
Only govern new changes and touched areas.
Do not require all historical code to become compliant.
```

Diff scopes:

```bash
aiflow check --base main
aiflow check --base origin/main
aiflow check --staged
aiflow check --since HEAD~1
```

Historical debt can be recorded without blocking the current change:

```bash
aiflow followup add "Refactor legacy auth module" --file src/auth/legacy.js --reason "out of scope"
aiflow followup list
```

## UI Validation

UI changes must declare a source and target. If there is no design source, `aiflow ui verify` creates a UI Brief scaffold. `aiflow check` requires the brief sections to be filled before UI completion can pass.

When Playwright is available, pass `--url` to capture browser evidence:

```bash
aiflow ui verify --url http://localhost:3000
```

Known visual deviations can be recorded explicitly:

```bash
aiflow ui deviation add --description "Chart legend wraps on tablet" --reason "Accepted until chart library upgrade" --accepted-by qa
aiflow ui deviation list
```

## Strictness

`strictness` and legacy level control whether findings are warnings or failures:

```text
legacy L0 / light  -> missing records are warnings
standard / L1-L2   -> required records are failures, role boundary is warning
strict / L3        -> required records and role boundary violations are failures
```

## License

MIT
