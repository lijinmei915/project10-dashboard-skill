---
layer: knowledge
type: spec
last_verified: 2026-06-13
---

# Skill 工程规范

> 用途：定义当前项目里 Agent Skill / Codex Skill 的生成边界。
> 什么时候更新：skill 结构、触发方式、分发策略或验收方式变化时。
> 不要写什么：具体某个 skill 的业务规则、一次性调研流水。

## 默认原则

- Skill 不是小型应用工程，默认不要生成过重完整包。
- 用户不需要选择 Skill 类型，也不需要知道 assets、scripts、schema、dist 是什么。
- 系统应先生成最小骨架，再根据目标产物、已有文件、下一步动作和验收要求自动补文件。
- `SKILL.md` 负责触发条件、边界、工作流和收尾检查。
- `references/` 放按需读取的领域知识。
- `assets/` 放输出模板、样式和数据资产。
- `scripts/` 放确定性操作。
- `tests/` / `fixtures/` 只在有脚本或可复测输出时生成。

## 推导信号

- 目标产物：文本、报告、HTML、设计稿、数据、脚本结果或安装包。
- 已有文件：`SKILL.md`、`open-design.json`、`assets/`、`scripts/`、`schemas/`、`fixtures/`、`dist/`。
- 下一步动作：继续写规则、预览输出、运行检查、安装、发布或分享。
- 验收要求：是否需要可复测输入、确定性检查、版本记录或外部安装验证。

## 自动补文件

- 默认：`SKILL.md` + `examples/` + 可选 `agents/openai.yaml`。
- 需要稳定领域资料或流程规则：增加 `references/`。
- 目标产物需要模板、报告、视觉或可复用资产：增加 `assets/` 和 `references/design.md`。
- 验收需要校验、转换、打包或本地工具：增加 `scripts/`、`schemas/`、`fixtures/`、`tests/`。
- 下一步动作需要发布、分享或安装包：增加 build-dist 和 manifest，并生成裁剪后的 `dist/`。
