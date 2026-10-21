# 契约越界由 Host 在 Run 后裁决，Agent 不能直接改契约

## 背景

v0.8 有了 Module 契约卡，但 Agent 仍在 worktree 内有写权限；如果它直接修改契约文件或禁止路径，流程只会把它当成普通 diff。工作流评审明确要求“实现者不许改契约；改契约 = 新 ticket/决策”。

## 决策

- 代码 Run 完成后，Host 从 diff 解析 changed files。
- 若变更命中模块 `contractPath`、`forbiddenPaths`，或 `src/`/`test/` 文件不在 `allowedPaths` 内：
  - Task 置为 `blocked`；
  - 生成「契约越界」待裁决 Decision，列出违规文件；
  - 保留 Run/worktree 作为审计证据，不静默丢弃。
- 不自动修改或回滚 worktree；由 Architect/Owner 决定改契约还是撤销改动。
- 契约变更的正路：先由 Architect/Owner 更新契约（新决策/新 ticket），再重新派单。

## 考虑过的选项

1. **只在 prompt 里禁止**：模型会遵守大部分，但没有强制。拒绝。
2. **运行时只读挂载契约文件**：实现复杂，且 Agent 可能通过其他路径绕过。拒绝。
3. **Run 后 diff 裁决**（选中）：简单、可审计，且不阻断正常编辑。

## 后果

- 契约修改会被拦截，但不会自动回滚；需要人处理 blocked 任务。
- `allowedPaths` 只对 `src/`/`test/` 生效，文档/配置修改不因允许路径被误杀。
- 空 `allowedPaths` 表示不限制代码路径，只检查契约/禁止路径。
- 还没有自动生成 Architect 重拆 ticket；当前只生成 Decision。

## 状态

Accepted（2026-10-22）
