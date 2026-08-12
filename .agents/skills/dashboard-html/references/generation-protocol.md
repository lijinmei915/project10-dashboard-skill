# AI 首稿生成协议

## 何时读取

用户通过自然语言要求新建、重构或局部修改 Dashboard / Report 时读取。仅调整已存在页面的单个视觉 token 时不必读取。

## 受控流程

```txt
Prompt
  -> Plan
  -> Workspace
  -> Command Batch
  -> Schema Validation
  -> Deterministic Render
```

完整交换结构见 `schemas/dashboard-generation.schema.json`。Agent 不直接修改预览 DOM，不把任意 HTML、SQL、脚本或数据源凭证写进 workspace。

## 阶段规则

1. **Request**：保留用户原始目标、受众、语言、页面类型和可选数据输入身份。
2. **Plan**：先确定页面叙事、section 目的和组件职责，不在此阶段决定具体 DOM。
3. **Workspace**：只使用 `dashboard-workspace.schema.json` 支持的主题、布局和资源字段。
4. **Commands**：生成或修改以原子操作批次表达；整个批次必须可撤销，不允许部分提交失败结果。
5. **Validation**：先校验 generation bundle，再渲染；失败时只修复无效字段，不擅自扩大用户需求。

## 页面级交互

- 用户明确要求筛选、按年份/月份/区域/行业查看时，使用 `document.controls[].type = filter-bar`；控件必须声明字段、选项、默认值和目标 ID。
- 用户明确要求视图、Tab 或分区切换时，使用 `view-tabs`；每个 Tab 必须引用存在的 Section ID。
- 当前筛选值和活动视图写入 `workspace.interactions`，不得写入卡片正文或临时 DOM。
- 需要筛选联动的 KPI、图表、表格和列表使用 `dataRef + binding` 分别声明 `aggregate / series / rows / ranking`；筛选字段和绑定字段必须存在于目标 dataset。
- 未明确要求交互时不生成控件。能力不足时隐藏筛选栏、显示默认首个视图，不能留下无反应控件。

## 图表语义

- 当前受控图表类型只包含 `line / area / bar / horizontal-bar / pie`；工作区写入 `component.props.chartType`，不得把任意 ECharts option 写入 `props`。
- 用户明确说折线图、面积图、柱状图或环形图时必须优先采用对应类型。
- 未明确指定时按任务选择：趋势/走势/时间序列使用折线图，累计/规模变化使用面积图，分类对比/排行/分布使用柱状图，占比/构成/份额使用环形图。
- 图表必须同时明确分类或时间维度、数值指标和聚合方式。无法匹配字段时保留问题或降级表达，不得凭空补造系列。
- 环形图首次生成默认使用分类色，确保扇区可区分；用户之后的单卡配色选择继续优先。
- 用户可在 Studio 选中图表卡片后切换类型；该操作修改组件内容属性，不能伪装成全局视觉 token。

## 数据来源

- `real`：来自用户明确提供或已授权的数据输入。
- `derived`：由真实字段按明确公式推导，必须记录公式或口径。
- `sample`：仅用于没有真实数据时生成可读首稿，页面必须显示“示例数据”或等价标识。

禁止把模型常识、随机值或占位趋势标记为真实数据。真实与示例混用时，bundle 的 `provenance.mode` 必须为 `mixed`，每个数据组件分别记录来源。

## 修改边界

- 整页创建或重构使用 `scope: { kind: "workspace" }`；局部 AI 修改使用 `scope: { kind: "component", id: "<stable-component-id>" }`。
- 局部请求只产生目标组件字段及必要关联 token 的 command，不重建整个 workspace；组件级批次不得包含 `path: "/"`。
- 复制、新增同类、删除、调宽、前移和后移必须使用受控结构命令，并原子同步 `document`、`layout`、可选 `canvasOrder` 及必要关联状态；不得用任意 HTML 或直接 DOM 操作代替。
- 新增或复制必须分配独立稳定 ID；摘要卡暂不复制，分区最后一张卡不得删除；卡片跨度只使用 `3 / 4 / 6 / 8 / 12` 档位。
- 候选必须在基线副本中预览，并以字段级 `before -> after` 差异供用户确认；模型摘要不能替代真实 diff。
- 接受时保存正向和反向 command batch；稳定 ID 数组的新增、删除和重排使用精确 `insert / remove / move` 逆操作。
- 撤销只能针对最新且未发生后续手动漂移的 revision；指定历史版本恢复必须追加新 revision，不得改写或截断旧历史。两者失败时均不得回退成整页覆盖。
- 用户手工修改后的字段默认受保护；除非请求明确覆盖，否则 Agent 不应重置。
- 删除、替换数据源或改变指标口径必须进入变更摘要。
- schema、渲染或资源能力不足时执行 `references/runtime.md` 的降级规则，不留下空组件。

## 失败处理

最多执行一次结构修复：根据校验错误调整 bundle 后重新校验。仍失败时保留当前 workspace，返回明确错误与可操作建议，不提交 command batch。
