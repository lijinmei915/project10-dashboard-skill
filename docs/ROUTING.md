---
layer: governance
type: spec
last_verified: 2026-06-30
depends_on: [AGENTS.md, .agents/skills/dashboard-html/SKILL.md]
---

# 请求路由

> 用途：定义常见请求应优先路由到什么工作方式或布局方向。
> 什么时候更新：新增稳定请求类型、路由规则变化时。
> 不要写什么：项目状态、交接流水、视觉细节实现。

## 项目级路由

- 提到“dashboard / analytics / KPI / status page / report page / card-based HTML UI”
  优先使用 `dashboard-html`
- 提到“standalone HTML”
  优先保持单文件 HTML 交付
- 提到“适配手机端 / 平板 / desktop”
  强制启用响应式约束
- 提到“不要限制内容 / 用户后续自己替换”
  优先输出通用布局骨架和中性占位

## dashboard-html 内部路由

- “概览 / summary / KPI”
  优先路由到 `grid` + `surface`
- “主内容 + 侧栏”
  优先路由到 `split`
- “连续小块 / notes / alerts / filters / actions”
  优先路由到 `stack`
- “大图表 / 大承载区 / embed / media”
  优先路由到 `canvas`
- “表格 / 记录 / 明细 / 数据扫描”
  优先路由到 `table-area`
- “只是一个独立模块 / 面板 / 卡片”
  优先路由到 `surface`

## 默认起稿顺序

当用户需求不完整，但明确要 dashboard 时：

1. 先建立 page header
2. 再用 `grid` 放摘要区
3. 再用 `split` 放主辅区
4. 如果出现大内容承载块，在 `surface` 内使用 `canvas`
5. 如果出现明细数据，再补 `table-area`

## 冲突处理

- 同时像 `grid` 和 `split` 时：
  有主次关系选 `split`，无主次的重复结构选 `grid`
- 同时像 `stack` 和 `table-area` 时：
  强调扫描字段选 `table-area`，强调顺序阅读选 `stack`
- 同时像 `canvas` 和普通卡片内容时：
  需要大承载区选 `canvas`，否则保持普通 `surface`
