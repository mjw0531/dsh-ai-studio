# 代码执行放在每 Task 的 git worktree，不碰主工作区

## 背景

v0.5 的 Agent 仍只读分析。要让 AI 真正开发项目，必须让它写代码；但直接在主工作区写会破坏“一个产物一个写入者”和隔离原则，也无法区分任务之间的修改。此时 Studio 还没有 Git worktree 能力。

## 决策

v0.6.0 引入最小的代码执行闭环：

- Project 增加 `repoPath`；未绑定仓库时继续只读分析。
- 派单前校验仓库并创建 `.worktrees/<taskId>` 与 `studio/<taskId>` 分支；worktree 已存在则复用。
- Agent 的 session cwd 指向 worktree，提示词允许修改文件、运行测试；禁止 merge/push 和修改主工作区。
- Run 持久化 `branchName / workspacePath / diffStat`，完成后从 worktree 读取 status + diff。
- 主工作区不自动改动；合并仍需治理流程和人类执行。
- 无人值守 Agent 的 approval policy 固定为 `never`，避免 approval 无人回答导致挂起；危险操作失败关闭（fail closed），不静默放行。

## 考虑过的选项

1. **在主工作区直接写**：实现最简单，但无法隔离、无法回滚、会污染主干。拒绝。
2. **只做只读分析，不写代码**：安全，但永远无法验证“AI 开发项目”。拒绝。
3. **每 Task 独立 worktree**（选中）：隔离、可 diff、可回滚，且与后续 merge 治理自然衔接。

## 后果

- Agent 的代码结果变成可审查的 branch + diff，而不是聊天里的代码片段。
- Worktree 目录被 `.gitignore` 忽略，不进入仓库；主分支保持干净。
- Windows 沙箱在部分 worktree 上无法配置写 ACL，导致 shell 启动失败；此时 Agent 仍可编辑文件，但测试需人工跑，Run 必须记录 blocker。
- 还没有自动 merge、冲突预检、diff 级评审；这些是 v0.6.1/v0.7。
- Worktree 会累积；需要后续清理/归档策略。

## 状态

Accepted（2026-10-22）
