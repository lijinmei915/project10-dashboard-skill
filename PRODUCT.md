---
layer: knowledge
type: spec
last_verified: 2026-06-30
depends_on: [README.md, PROJECT.md]
---

# 产品定义

> 用途：说明这个项目服务什么目标用户、解决什么问题、设计上坚持什么原则。
> 什么时候更新：产品定位、目标用户、设计原则发生变化时。
> 不要写什么：交接流水、实现细节、一次性任务记录。

## 当前定位

- 项目名：`project10-dashboard-skill`
- 当前定位：`一个用于生成轻量 standalone HTML dashboard 的 Codex skill 仓库`
- 当前交付物：`dashboard-html skill、参考文档、测试样例、starter HTML 模板`

## 目标用户

- 需要快速生成 dashboard HTML 的 AI 使用者
- 希望保留通用布局骨架、后续再自行替换内容的协作者

## 解决的问题

- 给生成式 UI 提供一套轻量、稳定、可复用的 dashboard 起始模板
- 降低每次重新发明 dashboard 页面骨架的成本
- 让输出默认兼顾桌面端、平板和手机端

## 设计原则

- 轻量优先：不引入复杂组件体系和沉重 token 架构
- 通用优先：尽量描述布局原语，不预设业务组件
- 可编辑优先：保留通用标题和英文占位，方便二次替换
- 多端优先：桌面、平板、手机都应保持可读

## 当前未定义

- 暂无更细的品牌视觉规范
- 暂无具体行业或业务域限制
