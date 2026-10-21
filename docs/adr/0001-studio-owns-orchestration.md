# Studio 自建编排层，不把实验性 Agent Teams 当领域核心

## 背景

DSH 自带的 `@deepseek-ai/dsh-experimental-agent-team` 已提供 roster、点对点消息、共享 task DAG 和 Web 端任务板，能快速做出「多 Agent 协作」的演示。但它的公开限制包括：实验性契约、扁平且不可嵌套的 roster、所有成员共享同一个 checkout、没有 worktree/merge、没有自动 ownership release，任务所有权和写范围只是建议性的。

Studio 的核心价值恰恰是这些缺口：项目级记忆、角色权限、隔离分支、独立验收、合并队列和审计。因此我们决定自建 Studio 领域层与调度器，复用 DSH 的 session/subagent 作为执行底座，而不是把 Agent Teams 的 roster/task board 直接当产品核心，也不 fork 它的实现。

## 考虑过的选项

1. **直接用 Agent Teams**：启动最快，但无法满足 worktree 隔离、合并治理、权限和项目记忆；实验性契约会把产品锁在别人的迭代节奏上。
2. **Fork Agent Teams**：能改，但会承担上游同步成本，且它的领域模型（扁平 roster、共享 checkout）与 Studio 的目标不一致。
3. **自建领域层 + 复用执行底座**（选中）：多写一层编排代码，但领域模型、状态机和权限由我们控制；DSH 升级只影响适配层。
4. **独立 Electron 壳**：UI 自由，但重复实现会话、工具、沙箱和插件系统，违背「可复用 DSH 插件」的目标。

## 后果

- 需要自己实现 Task 状态机、Lease、Mailbox、Merge Proposal、Policy 和 Project Book。
- 必须为 DSH 的 session/subagent/preset/tool API 写适配层，并用集成测试锁定版本行为。
- 可以渐进式借鉴 Agent Teams 的 projection 和 UI 模式，但不依赖其内部实现。
- 如果未来 Agent Teams 稳定并补齐 worktree/merge，可评估在其上做适配，而不是重写用户界面。

## 状态

Accepted（2026-10-21）
