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
last_verified: 2026-08-05
depends_on: [AGENTS.md]
---

# 项目状态

> 用途：回答“这个项目现在是什么阶段、架构怎样、进度到哪、下一步重点是什么”。
> 什么时候更新：阶段、架构、当前进度、已知问题、下一步重点变化时。
> 不要写什么：交接流水、详细历史、面向新用户的教程、长期决策论证。

## 项目定位

- 项目名：`项目10-dashboard skill`
- 一句话定位：`用于整理 AI 工程文档模板，并提供一个 example skill 骨架作为后续扩展示例。`
- 当前阶段：`可运行原型`

## 当前架构

- 入口层：`README.md`、`AGENTS.md`、`PROJECT.md`、`HANDOFF.md` 提供项目入口、协作规则与状态说明。
- 规则层：`docs/SKILL_ENGINEERING.md` 定义 Skill 工程边界；`.agents/skills/dashboard-html/SKILL.md` 定义单个 Skill 的触发与工作流骨架。
- 执行层：`.agents/skills/dashboard-html/agents/openai.yaml`、`references/`、`assets/templates/` 提供 agent 配置、规则文档和输出模板。
- Agent 运行层：本地 Node 服务提供探索预览及 Phosphor 全量图标搜索；导出层只输出选中的内联 SVG。

## 当前进度

- 已完成：`dashboard-html 已具备页面类型、视觉与布局编辑、分组级图标搜索，以及轻量 standalone HTML 导出。`
- 正在做：`通过真实 Agent 生成请求继续验证各主题、布局和局部配置组合。`
- 尚未开始：`完整自动化浏览器回归和正式发布流程。`

## 已知问题

- 当前只有服务脚本语法检查，尚无完整自动化测试框架。
- 文件保存 API 的真实落盘流程仍需在用户浏览器中人工确认。

## 下一步重点

1. 继续调试 Dashboard / Report 的视觉样式、局部配置和 Studio 交互。
2. 执行深浅模式和视觉预设的交叉回归。
3. 补充分组图标搜索、图表 SVG 及干净导出的自动化测试。
4. 用户确认后再合并并发布 Skill 分发包。

## 未来待办

- 将 Studio 与企业真实对象数据连接，但保持数据协议与页面 workspace 协议分离。
- 定义统一的对象、字段、指标和受控查询 DSL，避免 Dashboard 绑定企业原始字段。
- 第一阶段优先支持 CSV / Excel 与 REST API，再评估 PostgreSQL、MySQL 和主流 SaaS 连接器。
- 增加租户、对象、字段和行级权限；数据源凭证只保存在企业后端，不进入浏览器、成品 HTML 或模型上下文。
- 让 Agent 读取对象目录和指标口径生成 Dashboard，不允许直接执行任意 SQL。
- 企业交付形态预留 SaaS、私有化部署和嵌入式运行态三种模式。

## 相关文件

| 文件 | 关系 |
|------|------|
| `HANDOFF.md` | 当前交接上下文（短期） |
