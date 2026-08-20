---
layer: architecture
type: spec
last_verified: 2026-08-13
depends_on: [PRODUCT.md, .agents/skills/dashboard-html/data/chart-catalog.json]
---

# 资源中心

> 用途：定义 Studio 资源中心的产品边界、数据流、阶段和验收标准。
> 什么时候更新：资源类型、页面职责、应用协议或阶段门槛变化时。
> 不要写什么：一次性 UI 调整、资源内容副本或交接流水。

## 目标

资源中心是 Studio 和 AI 共用能力目录的可视化入口。它负责回答“支持什么、何时使用、需要什么数据、实际效果如何”，不复制图表、组件或图标定义。

独立地址为 `/studio/resources`。视觉设置标题旁提供入口，新标签页打开，避免浏览资源时丢失当前未保存编辑。

## 真相来源

- 图表：`/api/charts/catalog` + `/api/charts/render`
- 组件：`/api/components/catalog`
- 图标：`/api/icons/search` + `/api/icons/phosphor/:name`
- 图表唯一语义：`.agents/skills/dashboard-html/references/charts.md`

资源中心只消费公开目录，不维护第二份资源清单。AI Provider、Workspace Schema、Studio 和资源中心必须由合同检查保证目录一致。

## 阶段

### M1 图表与规范

- 展示所有受控图表的真实 SVG 预览。
- 支持按家族筛选和名称/语义搜索。
- 展示稳定 ID、适用场景、数据形状和别名。
- 规范 Tab 解释图表选择、颜色和便携降级原则。

### M2 应用到画布

- 从 Studio 携带选中图表卡片身份打开资源中心。
- 点击资源生成受控 `chartType` 修改，不直接操作 DOM。
- 无选区时保持只读浏览。
- 应用消息必须同时匹配当前 Studio 会话、当前选中图表卡片和受控图表目录；切换选区后旧资源页不得修改画布。
- 跨标签通信只传递稳定资源 ID 和目标 ID，不传递完整 Workspace 或业务数据。

## 应用协议

`studio/resource-application-protocol.mjs` 是资源中心与 Studio 的共享协议边界。Studio 为当前页面生成临时会话 ID，仅在选中 Workspace 图表卡片时把目标和会话写入资源中心 URL。资源中心通过同源 `BroadcastChannel` 发送单次 `apply-chart` 意图，Studio 校验后调用已有编辑器能力更新 Workspace、重绘并保存。

资源中心不能直接访问 Studio DOM、`localStorage` 或完整 Workspace。图标应用已扩展同一 `apply-icon` 协议；后续组件应用继续沿用该版本化边界，不另建页面专用数据通道。

### M3 组件与图标

- 组件资源展示真实结构、数据要求和降级方式。
- 图标资源支持搜索、粗细和填充预览。
- 应用动作沿用 Workspace/视觉覆盖协议。
- 组件目录直接消费 `/api/components/catalog`；资源中心不维护第二份组件类型清单。组件插入画布必须等布局、数据绑定、命令批次与撤销形成完整事务后再开放。
- 图标直接消费 `/api/icons/search` 与 `/api/icons/phosphor/:name`；应用前 Studio 必须向图标端点复验资源存在，不能只接受客户端名称。
- 卡片标题图标沿用当前全局显示、单卡名称覆盖规则；首次从资源中心应用时开启标题图标显示，图标名称只覆盖当前卡片。

### M4 设计规范

- 可视化颜色、字号、间距、圆角和图表配色规则。
- 规范内容来自 Skill references 或版本化公开目录。
- AI 和用户看到同一语义，不允许页面文案成为另一份真相。
- 机器可读摘要由 `data/design-standards.json` 提供，并显式声明 `themes.md`、`color-system.md` 和 `palette.v1.json` 为上游来源。
- `/api/design/standards` 同时服务资源中心、Studio 和 AI；合同检查固定规范版本、来源和颜色/字号/间距/形状/可访问性五类结构。

### M5 质量治理

- 每项资源显示目录版本和能力状态。
- 自动检查预览非空、移动端可读、便携导出存在。
- 新增资源必须通过目录、协议、Studio、AI、导出和资源页六层门禁。
- 页面顶部持续展示图表数量、组件目录版本、图标服务状态和设计规范版本；单项失败独立标红，不把其他已就绪能力误报为失败。
- `test/resource-center-contract.test.mjs` 检查四个资源视图、共享 API、18 图表、8 类组件和五类设计规范，禁止页面硬编码目录数量。

## M1 验收

- `/studio/resources` 可独立访问。
- 页面展示目录返回的全部图表，数量不硬编码。
- 每张图表由 `/api/charts/render` 真实生成；失败显示明确状态，不显示空白卡。
- 1280px 和 390px 宽度下无横向溢出、文字遮挡或嵌套卡片。
- 视觉设置入口可键盘访问，并在新标签页打开资源中心。
