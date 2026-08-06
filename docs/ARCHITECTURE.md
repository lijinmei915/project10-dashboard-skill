---
layer: knowledge
type: spec
last_verified: 2026-08-06
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
- Agent 预览运行层：`package.json` 与 `.agents/skills/dashboard-html/scripts/preview-server.mjs`

## dashboard-html skill 结构

- `SKILL.md`
  定义 skill 的触发时机、边界和工作流
- `agents/openai.yaml`
  提供平台侧展示与描述信息
- `assets/templates/starter.html`
  提供默认 dashboard HTML 起始骨架
- `assets/palette.v1.json`
  提供图表、KPI、分组标题共用的轻量固定色板；完整规则按需读取 `references/color-system.md`
- `references/*.md`
  提供布局规则、输出约束、测试方式和测试样例
- `data/icon-aliases.zh.json`
  提供 Agent 侧的中文图标搜索别名
- `scripts/preview-server.mjs`
  托管探索预览，按需搜索与清洗 Phosphor SVG，并通过 ECharts SSR 渲染受控图表 SVG
- `schemas/dashboard-workspace.schema.json`
  定义 Skill、Studio 和导出器共享的版本化状态协议
- `references/runtime.md`
  定义纯 Skill 降级、Studio 增强和静态/交互导出边界

## 信息流

1. 使用者触发 `dashboard-html`
2. Skill 从 `starter.html` 出发组织输出
3. 参考 `references/` 里的布局、输出和测试规则约束结果
4. 编辑分组标题图标时，预览页向本地 Agent API 查询 Phosphor 全量资源
5. 页面状态只记录各分组最终选择的图标名，预览 DOM 按需注入对应 SVG
6. 导出时移除设计器、搜索弹窗、脚本和 Agent API 依赖，只保留已选中的内联 SVG
7. 最终交付可离线使用的 standalone HTML 页面

## 生成能力分层

```txt
真实数据与用户意图
  -> 完整模式：Agent/Studio 的 Phosphor + ECharts SSR
  -> 通用模式：宿主 Agent 的图标、图表或包管理能力
  -> 降级模式：纯文字图标位 + 表格/排行/KPI 数据表达
  -> 统一固化为 standalone HTML
```

- 图标库和图表库是生成期依赖，不是默认成品依赖。
- 完整模式和通用模式都把最终选中的 SVG 内联到 HTML；默认导出后不再需要原始库。
- 降级模式保留数据与语义完整性。缺少图标时不保留空容器，缺少图表引擎时不保留空 canvas。
- 交互图表属于显式增强交付，按实际功能加入最小运行时，不改变静态导出的默认边界。

## 当前边界

- Node 运行时只服务于 Agent 的编辑和预览能力，不进入生成的 dashboard 成品
- `@phosphor-icons/core` 是 Agent 侧资源依赖；成品不打包图标库，也不依赖网络或搜索 API
- `echarts` 只在 Agent/Studio 服务端执行；默认成品固化 SVG，不加载 ECharts 运行时
- 预览仍为单文件 HTML，没有前端构建步骤
- 当前先保持单仓库开发；待协议稳定后再按 core、exporter、resources、studio 拆包
