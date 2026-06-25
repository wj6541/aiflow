# aiflow-kit

中文 | [English](#english)

CLI-first AI 交付流程工具，用于把 OpenSpec、AI agent 规则、CI、UI evidence（UI 证据）和显式交付动作组织成一套可落地的团队工作流。

`aiflow-kit` 安装后提供 `aiflow` 命令。

## 快速开始

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow intake fix-login --type bugfix --from dev --risk s1 --intent "Fix the login failure"
npx aiflow next
npx aiflow context --role dev
npx aiflow check
```

需要固定项目版本时，再执行：

```bash
npm i -D aiflow-kit
```

## 命令

```bash
aiflow --version
aiflow version
aiflow help
aiflow init [--mode auto|new|legacy] [--strictness light|standard|strict] [--ui auto|required|off]
aiflow doctor
aiflow change start <topic> [--type bugfix] [--from dev] [--role dev] --risk s1 [--ui]
aiflow change status
aiflow change list
aiflow change approve <change> --scope|--design|--risk s2
aiflow intake <topic> [--type bugfix] [--from dev] [--risk s1] [--intent text] [--value text] [--acceptance text]
aiflow route [--type bugfix] [--from dev] [--risk s1] [--ui]
aiflow next [--handoff] [--confirm] [--note text]
aiflow context [--role dev]
aiflow prompt [--role dev]
aiflow evidence add [--type validation] [--source manual] [--status passed] [--artifact file] [--command command] [--note text]
aiflow evidence list
aiflow check [--ci] [--base main|origin/main] [--staged] [--since HEAD~1]
aiflow ui classify
aiflow ui verify [--url http://localhost:3000]
aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
aiflow ui deviation list
aiflow test prompt
aiflow test generate [--ai] [--requirements file] [--page file] [--ui-brief file] [--constraints file] [--out file]
aiflow test review [--reason text]
aiflow test approve [--reason text]
aiflow test run --command "npm test"
aiflow test run --url http://localhost:3000 [--scenario file] [--reviewed]
aiflow handoff [--to qa] [--note text]
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
aiflow platform verify --provider github --pr <url> [--base main] [--required-reviews 1]
aiflow followup add <title> [--file path] [--reason text]
aiflow followup list
aiflow config migrate [--ci] [--allow-write]
```

## 检查内容

- Requirement source（需求来源）、validation records（验证记录）和 risk notes（风险记录）
- S2/S3 risk、scope、design approvals（风险、范围、设计审批）
- Changed files（变更文件）和 role boundaries（角色边界）
- Legacy diff scopes（老项目差异范围）：`--base`、`--staged`、`--since`
- UI source（UI 来源）、UI Brief（UI 简报）、截图、console errors（控制台错误）、responsive reports（响应式报告）和 known deviations（已知偏差）
- AI test generation prompts（AI 测试生成提示词）、scenario input packages（场景输入包）和 human review gates（人工确认门禁）
- Harness evidence（Harness 证据）：`harness-result.yaml/json` 是否存在、是否通过
- GitHub platform evidence（平台证据）：PR 状态、base branch、HEAD、CI/check runs、review blockers 和 mergeability
- 显式 delivery preparation、release/MR/merge records、archive actions（交付准备、发布/合并请求/合并记录、归档动作）

AI 生成的页面场景必须经过人工确认后才能执行。确认后，`aiflow test run --url` 会用 Playwright 按受控步骤执行 `goto`、`fill`、`click` 和 `expect_*` 断言，并写出 scenario results、harness result 和 screenshots。每个 scenario 必须包含至少一个可执行步骤和至少一个 `expect_*` 断言；外部 `goto` URL 和任意浏览器 JS 会被拦截。

`aiflow platform verify` 是只读校验：它会读取 GitHub PR 状态并写入 `.aiflow/artifacts/platform/` 和当前 change 的 `platform-evidence.yaml`，但不会创建 PR、merge、tag、publish 或 deploy。

## 产物

```text
.aiflow/config.yaml
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
.aiflow/artifacts/
openspec/changes/<topic>/
```

`aiflow init` 会自动把 `.aiflow/state/*.yaml` 加入 `.gitignore`，这些是本地 runtime state（运行状态）；`.aiflow/config.yaml` 是团队共享配置，应该提交。

`aiflow handoff` 会生成当前 change 的交接文档。使用 `aiflow handoff --to qa --note "Ready for QA"` 时，CLI 会显式把 `current_role` 推进到目标角色，并在 `openspec/changes/<change>/handoff.md` 记录 transition evidence；它不会执行 QA、release、merge、publish 或 archive 动作。也可以用 `aiflow next --handoff` 让 CLI 根据 route 提示下一角色，并在人工确认后执行 `aiflow next --handoff --confirm`，这样用户不需要记住目标角色命令。

模板文件打包在 `templates/` 中，供下游项目初始化和文档生成使用。

Route gates can require a lightweight requirement snapshot. `aiflow intake` writes a concrete snapshot, while `aiflow change start` writes a placeholder that team members must complete before strict delivery checks pass.

When `aiflow intake` is called without `--type`, ambiguous natural-language requests such as "I want to change/refactor the login module" start as `feature_request` with PM as the entry role. It only infers `refactor` when the intent explicitly says behavior is preserved, such as "without behavior changes" or "only change code structure." Passing `--type` overrides this inference.

Required architecture review is verified from recorded role/design artifacts or explicit approval. It is not automatic Architect execution.

Release gates are reported as metadata and explicit next-step commands. They do not trigger release, merge, publish, or archive.

完整 workflow model（流程模型）见仓库 README 和 PLAN.md。

## 一条命令接入

```bash
npx aiflow-kit init
```

这会自动判断项目类型：已有 `.git`、`package.json`、锁文件、源码目录、OpenSpec 或 AI 规则时按 legacy（老项目）接入；空目录按 new（新项目）接入。它会创建必要流程文件、保留已有 AI 规则，并自动忽略 `.aiflow/state/*.yaml`。

---

## English

CLI-first workflow layer for spec-driven, AI-assisted team software delivery.

`aiflow-kit` installs the `aiflow` command.

## Quick Start

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow intake fix-login --type bugfix --from dev --risk s1 --intent "Fix the login failure"
npx aiflow next
npx aiflow context --role dev
npx aiflow check
```

To pin the project version, run:

```bash
npm i -D aiflow-kit
```

## Commands

```bash
aiflow --version
aiflow version
aiflow help
aiflow init [--mode auto|new|legacy] [--strictness light|standard|strict] [--ui auto|required|off]
aiflow doctor
aiflow change start <topic> [--type bugfix] [--from dev] [--role dev] --risk s1 [--ui]
aiflow change status
aiflow change list
aiflow change approve <change> --scope|--design|--risk s2
aiflow intake <topic> [--type bugfix] [--from dev] [--risk s1] [--intent text] [--value text] [--acceptance text]
aiflow route [--type bugfix] [--from dev] [--risk s1] [--ui]
aiflow next [--handoff] [--confirm] [--note text]
aiflow context [--role dev]
aiflow prompt [--role dev]
aiflow evidence add [--type validation] [--source manual] [--status passed] [--artifact file] [--command command] [--note text]
aiflow evidence list
aiflow check [--ci] [--base main|origin/main] [--staged] [--since HEAD~1]
aiflow ui classify
aiflow ui verify [--url http://localhost:3000]
aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
aiflow ui deviation list
aiflow test prompt
aiflow test generate [--ai] [--requirements file] [--page file] [--ui-brief file] [--constraints file] [--out file]
aiflow test review [--reason text]
aiflow test approve [--reason text]
aiflow test run --command "npm test"
aiflow test run --url http://localhost:3000 [--scenario file] [--reviewed]
aiflow handoff [--to qa] [--note text]
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
aiflow platform verify --provider github --pr <url> [--base main] [--required-reviews 1]
aiflow followup add <title> [--file path] [--reason text]
aiflow followup list
aiflow config migrate [--ci] [--allow-write]
```

## What It Checks

- Requirement source, validation records, and risk notes.
- S2/S3 risk, scope, and design approvals.
- Changed files and role boundaries.
- Legacy diff scopes using `--base`, `--staged`, or `--since`.
- UI source, UI Brief, screenshots, console errors, responsive reports, and known deviations.
- AI test generation prompts, scenario input packages, and human review gates.
- Harness evidence through `harness-result.yaml/json` existence and status.
- GitHub platform evidence for PR state, base branch, HEAD, CI/check runs, review blockers, and mergeability.
- Explicit delivery preparation, release/MR/merge records, and archive actions.

AI-generated browser scenarios must be reviewed before execution. After review, `aiflow test run --url` uses Playwright to run constrained `goto`, `fill`, `click`, and `expect_*` steps, then writes scenario results, harness result files, and screenshots. Each scenario must include at least one executable step and one `expect_*` assertion; external `goto` URLs and arbitrary browser JavaScript are blocked.

`aiflow platform verify` is read-only. It reads GitHub PR state and writes `.aiflow/artifacts/platform/` plus the active change's `platform-evidence.yaml`; it does not create PRs, merge, tag, publish, or deploy.

## Artifacts

```text
.aiflow/config.yaml
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
.aiflow/artifacts/
openspec/changes/<topic>/
```

`aiflow init` adds `.aiflow/state/*.yaml` to `.gitignore` because those files are local runtime state. Keep `.aiflow/config.yaml` committed as shared team configuration.

`aiflow handoff` writes the current change handoff document. With `aiflow handoff --to qa --note "Ready for QA"`, the CLI explicitly advances `current_role` to the target role and records transition evidence in `openspec/changes/<change>/handoff.md`; it does not execute QA, release, merge, publish, or archive actions. You can also run `aiflow next --handoff` to let the CLI propose the computed next role, then run `aiflow next --handoff --confirm` after explicit human confirmation so users do not need to remember the target-role command.

Templates are bundled under `templates/` for downstream tooling and documentation.

See the repository README and PLAN.md for the full workflow model.

## One-command Onboarding

```bash
npx aiflow-kit init
```

This auto-detects the project type: directories with `.git`, `package.json`, lockfiles, source folders, OpenSpec, or AI rule files are initialized as legacy projects; empty directories are initialized as new projects. It creates the required workflow files, preserves existing AI rules, and ignores `.aiflow/state/*.yaml` automatically.
