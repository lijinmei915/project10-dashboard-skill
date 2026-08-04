---
layer: governance
type: spec
last_verified: 2026-08-04
depends_on: [AGENTS.md, .agents/skills/dashboard-html/SKILL.md]
---

# 请求路由

> 用途：定义常见请求应优先路由到什么工作方式或布局方向。
> 什么时候更新：新增稳定请求类型、路由规则变化时。
> 不要写什么：项目状态、交接流水、视觉细节实现。

## 执行顺序

1. 如果请求指向 `dashboard / analytics / KPI / status page / report page / card-based HTML UI`，优先使用 `dashboard-html`
2. 如果用户要求 `standalone HTML`，保持单文件 HTML 交付
3. 如果用户提到手机端、平板或 desktop，强制启用响应式约束
4. 如果用户说不要限制内容或后续自己替换，优先输出通用布局骨架和中性占位

## 布局路由

- 看板、监控、状态、实时概览
  使用 `pageType: dashboard`；默认全宽流式内容区、极简透明头部，卡片已有自身标题时省略分组标题
- 报告、分析、复盘、周期总结
  使用 `pageType: report`；默认阅读宽度、surface 头部并保留章节标题
- 同时出现两类意图
  持续扫描和发现异常选 `dashboard`；顺序阅读和理解结论选 `report`

- 概览、summary、KPI
  使用 `grid` + `surface`
- 主内容 + 侧栏
  使用 `split`
- notes、alerts、filters、actions、短列表
  使用 `stack`
- chart、media、embed、大承载区
  使用 `canvas`
- table、records、rows、明细、结构化数据
  使用 `table-area`
- 单独模块、独立面板、单卡片
  使用 `surface`

## 默认起稿

当用户没有给完整结构，但明确要 dashboard 时：

1. 建立 page header
2. 放摘要 `grid`
3. 放主辅 `split`
4. 大内容区在 `surface` 内使用 `canvas`
5. 明细区使用 `table-area`

## 冲突规则

- `grid` 和 `split` 冲突时：
  有主次关系选 `split`，无主次的重复结构选 `grid`
- `stack` 和 `table-area` 冲突时：
  强调顺序阅读选 `stack`，强调字段扫描选 `table-area`
- `canvas` 和普通卡片内容冲突时：
  需要大承载区选 `canvas`，否则保持普通 `surface`
