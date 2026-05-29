# aiflow-kit

中文 | [English](#english)

CLI-first AI 交付流程工具，用于把 OpenSpec、AI agent 规则、CI、UI evidence（UI 证据）和显式交付动作组织成一套可落地的团队工作流。

`aiflow-kit` 安装后提供 `aiflow` 命令。

## 快速开始

```bash
npx aiflow-kit init
npx aiflow doctor
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
npx aiflow handoff
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

## 检查内容

- Requirement source（需求来源）、validation records（验证记录）和 risk notes（风险记录）
- S2/S3 risk、scope、design approvals（风险、范围、设计审批）
- Changed files（变更文件）和 role boundaries（角色边界）
- Legacy diff scopes（老项目差异范围）：`--base`、`--staged`、`--since`
- UI source（UI 来源）、UI Brief（UI 简报）、截图、console errors（控制台错误）、responsive reports（响应式报告）和 known deviations（已知偏差）
- AI test generation prompts（AI 测试生成提示词）、scenario input packages（场景输入包）和 human review gates（人工确认门禁）
- 显式 delivery preparation、release/MR/merge records、archive actions（交付准备、发布/合并请求/合并记录、归档动作）

## 产物

```text
.aiflow/config.yaml
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
.aiflow/artifacts/
openspec/changes/<topic>/
```

`aiflow init` 会自动把 `.aiflow/state/*.yaml` 加入 `.gitignore`，这些是本地 runtime state（运行状态）；`.aiflow/config.yaml` 是团队共享配置，应该提交。

模板文件打包在 `templates/` 中，供下游项目初始化和文档生成使用。

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
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
npx aiflow handoff
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

## What It Checks

- Requirement source, validation records, and risk notes.
- S2/S3 risk, scope, and design approvals.
- Changed files and role boundaries.
- Legacy diff scopes using `--base`, `--staged`, or `--since`.
- UI source, UI Brief, screenshots, console errors, responsive reports, and known deviations.
- AI test generation prompts, scenario input packages, and human review gates.
- Explicit delivery preparation, release/MR/merge records, and archive actions.

## Artifacts

```text
.aiflow/config.yaml
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
.aiflow/artifacts/
openspec/changes/<topic>/
```

`aiflow init` adds `.aiflow/state/*.yaml` to `.gitignore` because those files are local runtime state. Keep `.aiflow/config.yaml` committed as shared team configuration.

Templates are bundled under `templates/` for downstream tooling and documentation.

See the repository README and PLAN.md for the full workflow model.

## One-command Onboarding

```bash
npx aiflow-kit init
```

This auto-detects the project type: directories with `.git`, `package.json`, lockfiles, source folders, OpenSpec, or AI rule files are initialized as legacy projects; empty directories are initialized as new projects. It creates the required workflow files, preserves existing AI rules, and ignores `.aiflow/state/*.yaml` automatically.
