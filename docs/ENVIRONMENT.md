---
layer: knowledge
type: guide
last_verified: 2026-08-05
depends_on: [README.md, PROJECT.md]
---

# 环境说明

> 用途：记录当前仓库的环境依赖、启动方式和已知限制。
> 什么时候更新：启动方式、依赖、包管理或运行入口发生变化时。
> 不要写什么：产品定位、交接流水、长期决策背景。

## 当前环境形态

- 仓库类型：`文档 + skill 资源 + 本地 Agent 预览服务`
- 运行时：`Node.js`
- 包管理：`npm`
- Agent 图标资源：`@phosphor-icons/core@2.1.1`
- Agent 图表渲染：`echarts@6.1.0`

## 启动方式

```bash
npm install
npm start
```

- 默认地址：`http://127.0.0.1:8765/.dashboard-preset-preview.html?design=1`
- 可通过 `PORT` 和 `HOST` 修改监听地址，例如 `PORT=8766 npm start`
- 静态模板仍可直接打开，但分组图标搜索与替换需要本地 Agent 服务
- 图表目录与 SVG 渲染接口同样由本地 Agent 服务提供

## 运行限制

- 服务脚本语法检查：`npm run check`
- 当前没有完整自动化测试框架，视觉和交互仍需浏览器验收
- `node_modules/` 仅为本地依赖，不提交仓库，也不会进入导出的 standalone HTML
