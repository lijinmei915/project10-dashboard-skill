<!-- 以下为「智能填写」自动检测的项目快照，可以参考填写下方内容。删掉此整块也无影响。 -->

> **项目快照（自动检测）**
> - 项目名称：项目10-dashboard skill
> - 简介：一个用于沉淀 AI 工程文档与 Skill 骨架示例的轻量项目仓库
> - 技术栈：—
> - 当前阶段：原型
> - 待办标记数（TODO/FIXME）：0

---
layer: knowledge
type: status
last_verified: 2026-06-04
depends_on: [AGENTS.md]
---

# 项目状态

> 用途：回答“这个项目现在是什么阶段、架构怎样、进度到哪、下一步重点是什么”。
> 什么时候更新：阶段、架构、当前进度、已知问题、下一步重点变化时。
> 不要写什么：交接流水、详细历史、面向新用户的教程、长期决策论证。

## 项目定位

- 项目名：`项目10-dashboard skill`
- 一句话定位：`用于整理 AI 工程文档模板，并提供一个 example skill 骨架作为后续扩展示例。`
- 当前阶段：`原型`

## 当前架构

- 入口层：`README.md`、`AGENTS.md`、`PROJECT.md`、`HANDOFF.md` 提供项目入口、协作规则与状态说明。
- 规则层：`docs/SKILL_ENGINEERING.md` 定义 Skill 工程边界；`.agents/skills/dashboard-html/SKILL.md` 定义单个 Skill 的触发与工作流骨架。
- 执行层：`.agents/skills/dashboard-html/agents/openai.yaml`、`references/`、`assets/templates/` 提供 agent 配置、规则文档和输出模板。

## 当前进度

- 已完成：`已写入项目级文档骨架，以及 dashboard-html skill 的基础目录结构与模板文件。`
- 正在做：`补全文档中的人工字段与交接信息。`
- 尚未开始：`补充真实业务定位、运行方式、测试方式，以及 dashboard-html skill 的具体规则内容。`

## 已知问题

- 仓库内暂无可验证的启动命令、测试命令和包管理配置。

## 下一步重点

1. 明确项目的真实产品定位，补齐 `README.md` 与 `PRODUCT.md`。
2. 为 `dashboard-html` skill 写清触发条件、边界、工作流和验收示例。
3. 视项目目标补充运行方式与测试方式。

## 相关文件

| 文件 | 关系 |
|------|------|
| `HANDOFF.md` | 当前交接上下文（短期） |
