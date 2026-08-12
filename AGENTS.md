<!-- 以下为「智能填写」自动检测的项目快照，可以参考填写下方内容。删掉此整块也无影响。 -->

> **项目快照（自动检测）**
> - 项目名称：项目10-dashboard skill
> - 技术栈：—
> - 包管理：—
> - 启动命令：当前无可验证启动命令（仓库仅见文档与 skill 骨架）
> - 测试命令：当前无可验证测试命令（仓库未发现测试脚本或测试配置）

---
layer: governance
type: spec
last_verified: 2026-08-06
depends_on: [docs/DOCUMENTATION.md]
---

# AGENTS

> 用途：定义 AI 进入这个项目后的行为规则。
> 什么时候更新：安全边界、文档职责变化时。
> 不要写什么：项目介绍、产品路线、交接流水、个人偏好。

## 安全规则

- 不确定意图时，先问再改
- 不覆盖已有文件，除非用户明确确认
- 用户说"只看不改"时，不修改任何文件
- 涉及删除、重命名、发布等不可逆操作，必须等明确确认

## 协作约定

- 改动前说明意图和影响范围
- 改完给出验证方式（命令、URL、预期结果）
- 遇到不确定的设计或架构决策，先问再动手
- 产品方向和设计调性参考 `PRODUCT.md`

## 文档职责

```txt
README.md              -> 项目入口说明
PRODUCT.md             -> 产品定位、用户画像、设计原则
PROJECT.md             -> 当前项目状态和进度
HANDOFF.md             -> 交接上下文
docs/ROUTING.md        -> 请求分流和默认路由
docs/ARCHITECTURE.md   -> 架构和模块职责
docs/ROADMAP.md        -> 产品平台长期路线和阶段门槛
docs/ENVIRONMENT.md    -> 环境、依赖、启动
docs/TESTING.md        -> 测试和验收
docs/SECURITY.md       -> 身份、授权、公开访问和敏感数据边界
docs/RUNBOOK.md        -> 常见操作和故障处理
docs/CHANGELOG.md      -> 结构性变更记录
docs/DECISIONS.md      -> 关键决策原因
docs/LESSONS.md        -> 错误复盘
```

写文档前先看 `docs/DOCUMENTATION.md` 确认边界。
处理用户请求前，如需判断分流或默认起稿方式，先看 `docs/ROUTING.md`。

## 收尾 Checklist

每次完成任务后检查：

- [ ] `HANDOFF.md` 是否需要更新（跨文件改动时）
- [ ] `docs/CHANGELOG.md` 是否需要记录（结构性改动时）
- [ ] `docs/DECISIONS.md` 是否需要记录（有明确技术决策时）
- [ ] `docs/LESSONS.md` 是否需要记录（犯错时）
