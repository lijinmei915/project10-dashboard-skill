# Output Rules

> 用途：定义独立 HTML dashboard 的交付底线。

## 必须满足

- 输出完整独立 HTML（含 `<!DOCTYPE html>`、`html`、`head`、`body`），复用 `assets/templates/starter.html` 的视觉 token、主题逻辑和响应式基础，而非固定模块。
- 默认保留 page header、单一居中容器和 card / surface 信息组织；除非用户明确要求，不重做视觉语言。
- 复用 starter 的弱阴影、圆角、间距和 token；只在空内容根节点内生成请求所需内容，不添加可见占位。
- 页面同时适配桌面、平板和手机；多列与侧栏在窄屏自然收缩或堆叠，触控区域不拥挤。

## 主题与边界

- 深色模式使用完整 `html[data-theme="dark"]` token 覆盖和 `color-scheme: dark`，不能只改 `data-theme` 或 `:root`。
- 只切换主题时，非颜色属性和页面结构保持原样；不自行加入可读性优化或页面内主题切换控件。
- 主题色仅改 `--accent`、`--accent-soft`；成功、提醒、错误等语义色保持含义。
- 不自动补 KPI、图表、筛选、导出、动画、厚边框、重阴影、玻璃拟态或另一套组件语言。

## 交付检查

- [ ] 完整 HTML，保留 header、starter 视觉基线和真实内容区
- [ ] 深色模式有完整 token 覆盖与 `color-scheme: dark`
- [ ] 只切主题时，非颜色属性与结构未变化
- [ ] 主题色未改写语义状态色
- [ ] 桌面、平板、手机均可用，多列在窄屏收缩或堆叠
