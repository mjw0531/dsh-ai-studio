# Host 自动提交 Agent 的 worktree 改动

## 背景

v2.0 dogfood 在 `D:\AIgame` 真实执行任务时发现：Agent 成功写出 `test/replay-verify.test.js`，但没有 `git add`/commit，文件是 untracked。合并提案和 merge 只认分支 commit，导致“Agent 说改了、分支里没有”。

## 决策

- Agent 成功后、Run 进入 review 前，Host 在 worktree 执行：
  - `git add -A`
  - `git -c user.name=Studio Agent -c user.email=agent@studio.local commit -m "studio: complete <taskId> (<runId>)"`
- 只提交 worktree 内改动，不碰主工作区。
- 没有改动时不创建空 commit。
- 提交前先记录 diffStat，保留提案需要的变更统计。
- 提交失败则 Run 失败，不进入 review。

## 考虑过的选项

1. **依赖 Agent 自己 commit**：dogfood 已证明不可靠。拒绝。
2. **不提交，merge 时直接 diff 工作区**：Git merge 不认未提交内容。拒绝。
3. **Host 自动提交**（选中）：保证分支与回执一致，可审计。

## 后果

- Agent 的提交作者是 Studio Agent，不是模型身份。
- 自动提交可能包含 Agent 意外创建的文件；契约门禁和 diff 仍需审查。
- 提交不会 push，也不会 merge。
- Windows ACL 阻断 git 时 Run 会失败并记录原因，不伪造成功。

## 状态

Accepted（2026-10-22）
