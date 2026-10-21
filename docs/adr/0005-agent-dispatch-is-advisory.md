# Agent 派单先做只读分析，代码执行等 worktree 隔离

## 背景

v0.4 要让 Task Room 真正启动 DSH Agent，而不是只记录人为状态。但此时 Project 还没有绑定 repoPath，也没有 task worktree；如果让 Agent 直接在 `process.cwd()` 写文件，就等于把“一个产物一个写入者”和“短分支隔离”两条原则同时破坏。另一方面，DSH 的模型凭据在 Web/Desktop 的账号链路里，程序化 Agent 必须用**已认证的 provider**，不能直接用配置里的 `deepseek-official`。

## 决策

v0.4 的派单是**只读分析模式**：

- 通过 `ctx.agents.create` 创建 Agent，并在 `setup` 里 `ctx.agentPresets.mount`，确保它有系统提示、工具和技能；
- 模型路由优先使用已认证的 `deepseek-account`，找不到再回退其他 provider；
- 提示词明确要求不修改文件，只返回结构化回执；
- 回执写入 Run，`evidence` 写回 Task；缺少 `summary` 或 `evidence` 时 Run 标记失败、任务退回 `ready`，不能进入 `review`；
- token 用量从 `ctx.tokenMeter.measure` 写入 Run；金额不做估算；
- 代码执行、worktree、真实文件变更留给 v0.6。

## 考虑过的选项

1. **直接让 Agent 在当前工作区改文件**：最快，但无法隔离，容易污染主干和用户仓库。拒绝。
2. **先做完整 worktree 再接 Agent**：更正确，但会把 v0.4 拖成一个巨型版本，且没有 repoPath 时无法实现。延后。
3. **只读分析 + 结构化回执**（选中）：先打通“派单→执行→回执→验收→计量”的完整链路，风险可控，也为 v0.6 的写入模式留下同一套 Run/回执结构。

## 后果

- Agent 的第一个真实用途是审查、规划、风险清单，而不是直接交付代码；这是有意的阶段边界。
- Run 的 `receipt`/`tokens` 已成为可审计事实，后续 worktree 执行可以复用。
- 只读约束目前靠提示词，不是强制策略；v0.6 必须用 worktree/权限策略替代提示词。
- 程序化 Agent 依赖 DSH 的 `agents` / `agentPresets` / `llm` / `tokenMeter` 公开服务；DSH 改这些接口时需要适配层。

## 状态

Accepted（2026-10-22）
