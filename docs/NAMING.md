---
layer: governance
type: spec
last_verified: 2026-06-04
depends_on: [docs/DOCUMENTATION.md]
---

# 文档命名规范

> 用途：定义文档命名和放置位置，让 AI 和人快速判断"这个文件该叫什么、放哪里"。
> 什么时候更新：新增文档类型、目录命名策略变化时。
> 不要写什么：具体文档内容、业务模块设计。

---

## 总原则

```txt
平台约定名不改。
根目录放入口。
docs/ 放工程治理。
```

## 根目录主流文件

| 文件 | 用途 |
|------|------|
| `README.md` | 项目入口 |
| `AGENTS.md` | AI 工作规则 |
| `PROJECT.md` | 项目当前状态 |
| `HANDOFF.md` | 交接上下文 |
| `PRODUCT.md` | 产品定义 |
| `INSTALL.md` | 安装说明 |

规则：社区约定或工具自动读取的文件放根目录，不要为了统一风格改名。

## AI 工具适配文件

| 工具 | 入口文件 |
|------|----------|
| 通用 agents | `AGENTS.md` |
| Claude | `CLAUDE.md` |
| Cursor | `.cursorrules` 或 `.cursor/rules/*.mdc` |
| Gemini | `GEMINI.md` |

规则：adapter 只翻译工具读取方式，通用规则写 `AGENTS.md`。

## docs/ 工程文档

`docs/` 下用大写主题名：

| 文件 | 回答的问题 |
|------|------------|
| `docs/ARCHITECTURE.md` | 系统结构和模块职责 |
| `docs/ROUTING.md` | AI 请求分流规则 |
| `docs/ENVIRONMENT.md` | 环境、依赖、启动 |
| `docs/TESTING.md` | 测试验收 |
| `docs/RUNBOOK.md` | 常见操作和故障处理 |
| `docs/DECISIONS.md` | 决策及原因 |
| `docs/CHANGELOG.md` | 结构性变更 |
| `docs/LESSONS.md` | 踩坑复盘 |
| `docs/SECURITY.md` | 工程安全边界，按需 |
| `docs/AI_SAFETY.md` | AI 输出和工具调用安全边界，按需 |

## Skill 目录命名

Skill 相关文件放在 `.agents/skills/<skill-name>/` 下：

| 文件 | 用途 |
|------|------|
| `.agents/skills/<skill-name>/SKILL.md` | skill 入口、触发条件、工作流 |
| `.agents/skills/<skill-name>/references/*.md` | skill 细规则、输出要求、验收方法 |
| `.agents/skills/<skill-name>/assets/templates/*.html` | HTML 起始模板或输出骨架 |
| `.agents/skills/<skill-name>/agents/*.yaml` | 特定 AI 平台的 skill 展示与默认提示 |

规则：skill 根目录使用短横线英文名；`references/`、`assets/templates/` 使用语义化小写文件名，不要出现 `misc.md`、`final.html` 这类弱语义命名。

## 子目录命名

深层专题文档用小写短横线：

```txt
docs/design/tokens.md
docs/design/layout.md
```

## 不建议的命名

避免：`notes.md`、`misc.md`、`todo.md`、`final.md` —— 没有语义边界。

不知道放哪里时，先写进 `HANDOFF.md`，稳定后再沉淀到对应 docs 文件。

## 相关文件

| 文件 | 关系 |
|------|------|
| `docs/DOCUMENTATION.md` | 文档编写规范和边界 |
| `AGENTS.md` | 文档职责总表 |
