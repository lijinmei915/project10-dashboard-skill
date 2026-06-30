---
layer: knowledge
type: guide
last_verified: 2026-06-30
depends_on: [.agents/skills/dashboard-html/references/testing.md]
---

# 测试与验收

> 用途：说明这个仓库目前如何进行测试和验收。
> 什么时候更新：测试方式、验收标准、自动化覆盖情况变化时。
> 不要写什么：交接流水、产品介绍、无关实现细节。

## 当前测试方式

- 以人工验收为主
- 重点验证 `dashboard-html` skill 的输出是否符合模板和规则
- 目前未发现可运行的自动化测试脚本

## 主要参考

- `.agents/skills/dashboard-html/references/testing.md`
- `.agents/skills/dashboard-html/references/test-cases.md`
- `.agents/skills/dashboard-html/references/test-log-template.md`

## 当前验收重点

- 是否输出完整 standalone HTML
- 是否保留轻量卡片式 dashboard 骨架
- 是否兼顾桌面端、平板和手机端
- 是否避免把内容类型写死
