# Git merge 只能人工触发，Host 只执行不主动合并

## 背景

v1.3 的合并仍是“记录状态”，`merged` 不是 Git 事实。工作流评审要求真实 merge，但自动合并风险过高：冲突、脏工作区、错误分支、不可逆覆盖都可能破坏主分支。

## 决策

- 新增 `POST /merge-proposals/:id/execute`，只允许人在 UI 点击“执行 Git 合并”后调用。
- 前置条件（全部满足才执行）：
  - proposal 状态必须是 `approved`；
  - 项目绑定 repoPath；
  - 当前分支必须等于 proposal.base（不自动切分支）；
  - 工作区必须干净；
  - 任务分支必须存在；
  - 不能有未完成的 merge。
- 执行 `git merge --no-ff <branch> -m ...`；冲突时 `git merge --abort` 并报错。
- 成功后记录真实 `mergeCommit`，proposal 置为 `merged`。
- 不 push、不自动合并、不自动切换到 base。
- 保留“仅记录合并”作为外部人工合并/无 Git 环境的 fallback。

## 考虑过的选项

1. **批准后自动 merge**：不可控，违背“人批准才执行”的治理。拒绝。
2. **Host 自动切到 base 再 merge**：会改变用户工作区，风险高。拒绝。
3. **人工点击 + 严格前置检查**（选中）：把执行交给 Host，但触发权在人。

## 后果

- 合并失败会 abort，工作区回到 merge 前状态；已产生的本地 commit 仍保留。
- 如果 base 不是 main，需人在 UI 里填写正确的 base。
- 还没有合并后回归/自动回滚；v1.5 再补。
- `features.gitMerge` 仍为 false（没有自动合并）；`mergeExecution` 为 true。

## 状态

Accepted（2026-10-22）
