---
layer: knowledge
type: log
last_verified: 2026-06-30
depends_on: [docs/CHANGELOG.md]
---

# 关键决策

> 用途：记录已经明确做出的工程或内容决策，以及原因。
> 什么时候更新：确认一个会持续影响仓库的决策时。
> 不要写什么：临时想法、待办清单、交接流水。

## 2026-06-30

### 决策 1：skill 保持轻量

- 结论：`dashboard-html` 不引入复杂 token 体系和重组件分类
- 原因：当前目标是提供一个易复用、易编辑的 standalone HTML dashboard skill

### 决策 2：使用布局原语而不是固定业务组件

- 结论：以 `surface`、`stack`、`grid`、`split`、`canvas`、`table-area` 组织规则
- 原因：降低内容预设，让不同业务都能复用同一 skill 骨架

### 决策 3：界面不直接暴露原语标签

- 结论：原语保留在规则文档中，不直接显示在最终模板界面上
- 原因：避免打断成品感，同时保留底层结构约束
