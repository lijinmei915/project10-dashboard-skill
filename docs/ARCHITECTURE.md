---
layer: knowledge
type: spec
last_verified: 2026-06-30
depends_on: [PROJECT.md, docs/SKILL_ENGINEERING.md]
---

# 架构说明

> 用途：说明仓库的主要模块、目录职责和信息流。
> 什么时候更新：目录结构、模块边界、核心依赖关系变化时。
> 不要写什么：交接流水、产品路线、一次性任务安排。

## 当前结构

- 根目录文档层：`README.md`、`AGENTS.md`、`PRODUCT.md`、`PROJECT.md`、`HANDOFF.md`
- 治理文档层：`docs/`
- Skill 执行层：`.agents/skills/dashboard-html/`

## dashboard-html skill 结构

- `SKILL.md`
  定义 skill 的触发时机、边界和工作流
- `agents/openai.yaml`
  提供平台侧展示与描述信息
- `assets/templates/starter.html`
  提供默认 dashboard HTML 起始骨架
- `references/*.md`
  提供布局规则、输出约束、测试方式和测试样例
- `examples/*.md`
  提供示例输入

## 信息流

1. 使用者触发 `dashboard-html`
2. Skill 从 `starter.html` 出发组织输出
3. 参考 `references/` 里的布局、输出和测试规则约束结果
4. 最终交付 standalone HTML 页面

## 当前边界

- 当前仓库以文档和 skill 资产为主
- 暂无应用运行时、服务端模块或前端工程构建链
