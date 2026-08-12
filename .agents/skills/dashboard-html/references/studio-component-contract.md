---
layer: skill
type: reference
last_verified: 2026-08-12
---

# Studio Component Contract

Studio 是产品平台能力，不属于 Dashboard 成品。Agent 只需要理解以下语义，不需要携带 Studio 组件源码：

| 语义 | 用途 | 成品边界 |
|---|---|---|
| `Button` | 提交、保存、取消等明确动作 | 输出原生 `button` |
| `Input` | 搜索、文本和数值输入 | 输出原生 `input` 或 `textarea` |
| `Select` | 有限选项选择 | 输出原生 `select` |
| `Tabs` | 页面或工作区范围切换 | 输出可访问的按钮组 |
| `Dialog` | Studio 管理流程 | 不进入导出成品 |
| `Checkbox` | 二元配置 | 输出原生 checkbox |
| `Badge` | 状态和标签 | 输出语义文本，不依赖组件库 |
| `Table` | 多行数据比较 | 输出可响应式滚动的 HTML 表格 |

平台可以用 shadcn/Radix 或其他实现；Skill 只遵循语义、键盘可用性、主题 token 和导出边界。
