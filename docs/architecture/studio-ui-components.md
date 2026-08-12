---
layer: architecture
type: spec
last_verified: 2026-08-12
---

# Studio UI Components

> 用途：定义产品平台 Studio 的基础交互组件边界。
> 什么时候更新：Studio 新增或替换基础交互组件时。
> 不要写什么：成品 Dashboard 的视觉组件实现。

## 分层

- `studio/` 是产品平台运行时，可以使用完整的 UI 组件实现。
- `.agents/skills/dashboard-html/` 是给 Agent 的轻量包，只描述组件契约、token 和输出规则。
- `assets/templates/starter.html` 是成品起点，不依赖 Studio 组件运行时。

## 第一批基础组件

Studio 项目中心统一收敛以下组件：`Button`、`Input`、`Select`、`Tabs`、`Dialog`、`Checkbox`、`Badge` 和 `Table`。

组件必须支持原生键盘操作、可见焦点、禁用态和主题 token。组件 API 只处理交互状态，不把项目业务请求写入组件层。

## 约束

- Studio 组件可以演进为 React/shadcn/Radix 实现，但业务模块只依赖稳定的语义属性和事件。
- Skill 不携带完整组件库源码、`node_modules` 或 Studio 服务端代码。
- 导出 Dashboard 不得引用 `studio/`、组件库 CDN 或平台 API。
