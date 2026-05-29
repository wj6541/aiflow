# aiflow：CLI-first 的团队 AI 交付流程工具

## Summary

`aiflow` 是一个可开源的 npm CLI 工具，用来把 AI 辅助开发过程中的需求、设计、实现、验证、UI 证据、交接、交付收口标准化。

它不是要替代 OpenSpec、Playwright、AGENTS.md、Cursor rules、Claude Code/Codex/Copilot 规则文件、CI 或团队现有工程规范，而是把这些能力编排成一套团队可执行的 CLI 工作流。

核心目标：

- 新项目支持严格流程。
- 老项目支持增量治理，只约束本次变更和被触碰区域。
- 一个 change 表示一个业务变更，PM、Architect、Dev、QA、Release、UI 都是该 change 下的职责产物。
- 同一个人可以兼任多个职责，但职责边界和产物必须记录清楚。
- UI 变更必须有来源和验证证据。
- Release、archive、MR、merge 必须显式触发，不能因为一次对话或一次任务完成就自动收口。
- CLI 支持本地交互，也支持 CI 非交互模式。

一句话定位：

```text
A CLI-first workflow layer for spec-driven, AI-assisted team software delivery.
```

## README 一分钟价值证明

```bash
npm i -D aiflow-kit

npx aiflow init --mode legacy
npx aiflow doctor
npx aiflow change start fix-login --role dev --risk s1
npx aiflow check
npx aiflow handoff
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

✗ Missing validation record
✗ Missing requirement source

Next:
- Add requirement source to openspec/changes/fix-login/dev.md
- Record validation result before handoff
```

用户一分钟内应该理解：

- `aiflow` 检查 AI 开发流程中的需求来源、职责边界、验证记录、UI 证据和交付收口。
- `aiflow` 不替代代码实现、OpenSpec、Playwright、CI 或代码评审。
- 老项目可以低成本接入，只检查本次 diff 和被触碰区域。
- 交付收口必须显式命令触发。

## Product Shape

发布 npm 包：

```text
aiflow-kit
```

命令入口：

```bash
aiflow
```

项目接入后，最小生成：

```text
AGENTS.md
TOOLS.md

.aiflow/
  config.yaml
  state/
  artifacts/

openspec/
  changes/
  specs/

docs/
  project-profile.md
```

可选生成：

```text
SOUL.md
USER.md
docs/engineering-rules.md
docs/ui-acceptance.md
docs/legacy-compatibility.md
.cursor/rules/
.cursor/skills/
```

底层优先复用：

- OpenSpec 或兼容结构
- Playwright 的截图和浏览器验证能力
- AGENTS.md 及已有 AI agent 规则文件
- Cursor rules
- Claude Code / Codex / Copilot 等工具的项目规则文件
- CI 中已有 lint、typecheck、test、build 命令
- 后续可选接入 Danger、reviewdog、conftest 等门禁工具

## CLI Design

### version

```bash
aiflow --version
aiflow version
aiflow help
```

行为：

- 输出当前 CLI 包版本。
- 不读取用户项目自身的 `package.json` 版本。
- `aiflow help` 与 `aiflow --help` 等价，输出公共命令面。

### init

```bash
aiflow init
aiflow init --mode new
aiflow init --mode legacy
aiflow init --strictness light|standard|strict
aiflow init --ui auto|required|off
```

行为：

- 新项目默认 `mode: new`，推荐 `strictness: strict`。
- 老项目默认 `mode: legacy`，使用增量治理。
- 不覆盖已有 README、CI、工程脚本。
- 已存在 `AGENTS.md`、`TOOLS.md`、`openspec/`、`.cursor/rules/` 时，默认进入 merge 检查，不直接覆盖。
- merge 检查输出 `.aiflow/artifacts/init-merge-report.md`，记录保留文件、潜在冲突和合并建议。
- 重复执行必须幂等。

### doctor

```bash
aiflow doctor
```

只读检查：

- 是否为 git 仓库
- 项目类型和技术栈
- 包管理器：npm、pnpm、yarn、bun
- lint、typecheck、test、build 命令
- CI 类型
- 是否已有 OpenSpec 或类似结构
- OpenSpec 结构是否兼容单一业务 change 模型
- 是否已有 AGENTS.md、Cursor rules、Claude/Codex/Copilot 规则文件
- 是否存在可能允许自动 merge/archive 的规则冲突
- 是否已有 Playwright 或 UI 测试能力
- 当前推荐接入模式和缺失项

### change

```bash
aiflow change start <topic> --role dev --risk s1
aiflow change status
aiflow change list
aiflow change approve <change> --scope
aiflow change approve <change> --design
aiflow change approve <change> --risk s2
```

规则：

- 一个 change 对应一个业务变更。
- 不为每个 role 创建独立 change。
- 默认复用相同 `<topic>` 的 active change。
- S2/S3 自动要求确认记录。
- 老项目只约束 changed files 和被触碰区域。

### check

```bash
aiflow check
aiflow check --ci
aiflow check --base main
aiflow check --base origin/main
aiflow check --staged
aiflow check --since HEAD~1
```

检查：

- 当前 change 是否存在
- 当前 role 是否记录
- changed files 是否符合职责边界
- 是否有需求来源
- 是否有验证记录
- 是否有风险说明
- UI 变更是否有 UI source 和 visual validation
- S2/S3 是否有人类风险、范围、设计确认记录
- release/archive/MR/merge 是否显式触发
- legacy 模式是否只检查本次 diff
- git diff base / since ref 是否有效

### ui

```bash
aiflow ui classify
aiflow ui verify [--url http://localhost:3000]
aiflow ui deviation add --description <text> --reason <text> [--accepted-by name]
aiflow ui deviation list
```

行为：

- 识别 UI source。
- 生成或要求补 UI Brief。
- 无设计稿且 UI 变更受约束时，`check` 必须要求 UI Brief 关键章节已填写。
- 运行截图、控制台、响应式检查。
- 记录 known deviations。
- 不替代人工审美判断，只收集证据、记录偏差、标记风险。
- 未提供 `--url` 时只生成证据骨架和 Playwright runner。
- 提供 `--url` 且项目可用 Playwright 时，打开页面并生成 desktop/tablet/mobile 截图、console 错误报告和响应式报告。

### handoff

```bash
aiflow handoff
```

生成当前阶段摘要，不自动 release，不自动 archive，不自动创建 MR。

### delivery

```bash
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
```

只有显式执行 delivery 命令，才进入交付收口。

`delivery prepare` 生成可用于 MR / release 的结构化草稿：

- What Changed
- Why
- Scope
- Validation commands
- UI Evidence
- Risk
- Rollback
- Explicit Actions

`delivery record` 用于记录已经由人或外部平台显式完成的 MR、merge 或 release 动作。CLI 只记录证据和状态，不默认调用 GitHub、GitLab、npm、生产发布系统，也不自动 push / merge / release。

## Change Model

一个业务变更对应一个 change：

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

文件职责：

- `proposal.md`：变更动机、业务目标、范围、非目标、影响。
- `design.md`：整体设计、技术取舍、接口、数据、兼容性、风险。
- `tasks.md`：任务拆分、执行进度、验证清单。
- `pm.md`：需求澄清、用户故事、范围确认、验收口径。
- `architect.md`：架构方案、关键决策、数据/接口/流程设计。
- `dev.md`：实现记录、changed files、基础测试、实现验证。
- `qa.md`：验收记录、回归结果、风险判定。
- `release.md`：交付准备、MR 摘要、release notes、收口记录。
- `ui.md`：UI 来源、UI Brief、页面/状态/路由说明。
- `visual-validation.md`：截图、响应式、控制台、偏差和视觉验收结果。
- `approvals.md`：范围、设计、风险、交付、归档等人类确认记录。

## Workflow Model

职责模式：

```text
PM          需求、范围、非目标、验收口径
Architect   技术方案、接口、数据、核心流程、风险
Dev         实现、基础测试、实现验证、契约同步
QA          验收、回归、风险判定、视觉质量判断
Release     MR、merge、release、archive、交付收口
UI          UI 来源、UI Brief、还原、截图证据、视觉偏差
```

主状态：

```text
draft
in_progress
implemented
validated
waiting_delivery
released
archived
blocked
```

checks metadata：

```yaml
checks:
  scope_required: true
  scope_approved: true
  design_required: true
  design_approved: true
  risk_approval_required: true
  risk_confirmed: true
  requirement_source_recorded: true
  validation_recorded: true
  ui_required: true
  ui_brief_required: true
  ui_validated: false
  delivery_prepared: false
```

关键规则：

- `validated` 不等于 `released`。
- `released` 不等于 `archived`。
- `approved` 只是检查项，不与主状态混在一起。
- archive / release 必须显式命令触发。

风险分级：

```text
S0 小改动：快速通道，记录验证即可。
S1 普通功能：需要需求来源、基础设计、实现和 QA。
S2 高风险功能：数据库、权限、安全、核心流程、外部接口，必须确认风险、范围和设计。
S3 交付或不可逆动作：MR、merge、release、archive、生产变更，必须确认风险、范围、设计和交付动作。
```

## Legacy Compatibility

老项目采用 incremental governance：

```text
只治理新增变化和被触碰区域
不追溯要求全量合规
```

等级：

```text
L0 read-only
L1 traceable-changes
L2 guarded-delivery
L3 strict
```

检查强度：

```text
L0 / light
缺失需求来源、验证、风险记录只作为 warning。

L1-L2 / standard
缺失需求来源、验证、风险记录作为 failure。
角色边界越界作为 warning。

L3 / strict
缺失记录和角色边界越界都作为 failure。
```

Git diff 基准：

```bash
aiflow check --base main
aiflow check --base origin/main
aiflow check --staged
aiflow check --since HEAD~1
```

当 `base_branch: main` 但本地 `main` ref 不存在时，CLI 可回退到 `origin/main`，以兼容 GitHub Actions PR checkout 等场景。

monorepo：

- `doctor` 识别 workspace root 和 package roots。
- `check` 基于 changed files 输出 touched packages。
- 第一版不自动为每个 touched package 推断 test/build 命令，仍以项目配置的命令为准。

规则：

- 不要求补齐历史 OpenSpec。
- 不强制重构历史目录。
- 不覆盖已有工程规则。
- 不因为老代码不规范阻断当前变更。
- 只检查本次 changed files。
- 被触碰模块补最小必要说明。
- 技术债记录为 follow-up，不混入当前 change。

follow-up 命令：

```bash
aiflow followup add <title> [--file path] [--reason text]
aiflow followup list
```

follow-up 写入 `.aiflow/artifacts/follow-ups.md`，用于记录历史技术债、后续重构、非本次范围问题。follow-up 不作为当前 `check` 的失败条件。

## UI Evidence & Validation

UI source：

```text
figma
screenshot
existing_product
design_system
text_spec
reference_product
none
```

UI target：

```text
design_restoration
visual_consistency
product_usability
```

产物路径：

```text
openspec/changes/<change>/visual-validation.md

.aiflow/artifacts/screenshots/
.aiflow/artifacts/ui/console-errors.json
.aiflow/artifacts/ui/responsive-check.json
.aiflow/artifacts/ui/known-deviations.md
.aiflow/artifacts/ui/ui-brief.md
```

UI schema：

```yaml
ui_source: figma | screenshot | existing_product | design_system | text_spec | reference_product | none
ui_target: design_restoration | visual_consistency | product_usability
routes:
  - path: /dashboard
viewports:
  - desktop
  - tablet
  - mobile
console_errors: pass | fail
responsive: pass | fail
known_deviations:
  - description:
    reason:
    accepted_by:
    accepted_at:
```

无设计稿时必须生成或要求补 UI Brief。UI Brief 不能只保留 scaffold / TODO；`Goal`、`Users`、`Layout`、`Key States`、`Style Source`、`Acceptance` 需要填写后才算 UI evidence 完整。

known deviations 通过 `aiflow ui deviation add/list` 记录到 `.aiflow/artifacts/ui/known-deviations.md`，并同步追加到当前 change 的 `visual-validation.md`。CLI 只记录偏差和接受证据，不自动判断审美是否通过。

## Approvals & CI Mode

CI 中不能依赖命令行 y/n。

```bash
aiflow check --ci
aiflow change approve <change> --scope
aiflow change approve <change> --design
aiflow change approve <change> --risk s2
aiflow delivery approve
aiflow delivery prepare
aiflow delivery record <change> --action mr|merge|release --ref <value>
aiflow delivery archive <change>
```

`approvals.md` 记录：

```yaml
approved_by:
approved_at:
risk_level:
scope:
reason:
command:
commit:
```

Exit codes：

```text
0 = pass
1 = check failed
2 = config error
3 = missing dependency
4 = unsafe operation blocked
```

## Config & State

`.aiflow/config.yaml` 最小 schema：

```yaml
version: 1
mode: new | legacy
strictness: light | standard | strict
ui: auto | required | off
base_branch: main
package_manager: npm | pnpm | yarn | bun | unknown
roles:
  current: dev
legacy:
  level: L0 | L1 | L2 | L3
checks:
  require_source: true
  require_validation: true
  require_risk: true
  require_ui_evidence: auto
delivery:
  require_explicit_release: true
  require_explicit_archive: true
```

`.aiflow/state/` 只记录当前工作状态和最近一次 checklist 快照，不替代 openspec 文档。

```text
.aiflow/state/current.yaml
.aiflow/state/checks.yaml
```

`checks.yaml` 由 `aiflow check` 写入，只表示最近一次 CLI 判断结果。可审查事实来源仍然是 `openspec/changes/<change>/`、`approvals.md`、UI artifacts 和 git diff。

Config migration：

```bash
aiflow config migrate
aiflow config migrate --ci
aiflow config migrate --ci --allow-write
```

规则：

- `version` 必须存在。
- 缺失或未知 version 返回 config error。
- `--ci` 默认只预览缺失字段，不写文件。
- `--ci --allow-write` 允许写入缺失的 v1 字段。
- migration 保留未知自定义字段，不重写整份配置。

## AI Rules Compatibility

`AGENTS.md` 是 AI agent 项目规则文件，不是唯一标准。

规则：

- 优先兼容项目已有约定。
- 不强行覆盖已有 AGENTS.md。
- 兼容 Cursor rules。
- 兼容 Claude Code / Codex / Copilot 等工具的规则文件。
- 通过 `TOOLS.md` 记录当前项目实际使用的 AI 工具和命令。
- 如果已有多套规则冲突，`aiflow doctor` 应报告冲突，不自动裁决。

## Open Source Plan

仓库结构：

```text
aiflow/
  packages/
    cli/
      LICENSE
      README.md
      package.json
      src/
        cli.js
        core.js
        constants.js
        config.js
        fs-utils.js
        project.js
        check.js
        ui.js
        delivery.js
        templates.js
      templates/
  docs/
    project-profile.md
    getting-started.md
    legacy-projects.md
    ui-validation.md
    ui-e2e.md
    workflow-model.md
    ci-mode.md
    config.md
    release.md
    release-checklist.md
    gitlab-ci.example.yml
  examples/
    new-project/
    legacy-project/
    monorepo/
    ui-app/
  scripts/
    package-smoke.mjs
  openspec/
    changes/
    specs/
  .aiflow/
    config.yaml
  .github/
    workflows/
      ci.yml
  AGENTS.md
  TOOLS.md
  CONTRIBUTING.md
  SECURITY.md
  CHANGELOG.md
  package-lock.json
  README.md
  PLAN.md
  LICENSE
```

License 推荐 MIT。

npm package metadata：

- current package name: `aiflow-kit`
- future scoped package option: `@aiflow/cli`
- bin: `aiflow`
- bundled templates: `packages/cli/templates/`
- license: MIT
- repository / homepage / bugs metadata should point to the public GitHub repository before publishing.

## Test Plan

覆盖：

- init 幂等
- doctor 只读
- 单 change 多 role 模型
- changed files diff scope
- legacy 只检查触碰区域
- UI source / UI Brief / visual artifacts
- UI example fallback verification without Playwright
- Playwright runner branch with mocked Playwright module
- S2/S3 approval
- delivery explicit trigger
- config migrate CI read-only behavior
- config/state 恢复
- Windows/macOS/Linux 路径兼容
- monorepo package root/workspace root
- npm / pnpm / yarn / bun lockfile and `packageManager` detection
- npm pack dry-run
- package tarball install smoke test
- exit codes
- config error / unsafe operation exit code boundaries

## Assumptions

- 第一版产品范围保留完整 CLI：init、doctor、change、check、ui verify、handoff、delivery。
- 第一版优先 npm CLI，不做 Web 平台。
- CLI 名称暂定 `aiflow`，开源前可重新命名。
- 第一版不深度依赖 GitHub/GitLab API，只使用本地 git、文件和命令。
- OpenSpec 结构保持兼容，但 CLI 提供更便捷的封装。
- UI 校验第一版基于 Playwright；Figma 深度集成后续再做。
- 老项目默认 L1，避免一接入就产生大量历史噪音。
- 团队正式 review 和 AI 工具门禁是两层机制，不能互相替代。
