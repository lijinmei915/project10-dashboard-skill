---
layer: knowledge
type: guide
last_verified: 2026-06-30
depends_on: [docs/ENVIRONMENT.md, docs/TESTING.md]
---

# 运行手册

> 用途：记录当前仓库常见操作和排查入口。
> 什么时候更新：常见操作、排查路径或交付流程发生变化时。
> 不要写什么：产品路线、交接流水、长期决策论证。

## 常见操作

- 预览基础模板：
  打开 `.agents/skills/dashboard-html/assets/templates/starter.html`
- 查看 skill 规则：
  阅读 `.agents/skills/dashboard-html/SKILL.md` 与 `references/`
- 验收真实 PostgreSQL 连接：
  在部署方已注入 `DASHBOARD_POSTGRES_CONNECTORS_JSON` 和对应只读连接串后运行 `npm run smoke:postgres-connector`；多连接时同时设置 `DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF=<configured-ref>`。成功输出不得包含 SQL、连接串或数据行

## 常见排查

- 如果页面结构跑偏：
  先检查是否仍从 `starter.html` 出发
- 如果输出过于业务化：
  先检查是否遵守 `references/topic.md` 中的通用布局原语规则
- 如果手机端表现异常：
  先按 `docs/TESTING.md` 和 skill 内测试清单做人工验收
- 如果 PostgreSQL smoke 立即失败：
  检查 connector JSON 是否为对象、引用是否存在、`connectionStringEnv` 是否指向已注入环境变量；不要把连接串或 SQL 传给浏览器，也不要通过放宽 smoke 参数绕过白名单
