# 合并后回归由 Host 在 repo 上执行，失败只警告不自动回滚

## 背景

v1.4 的 Git merge 只检查 merge 本身是否冲突，没有在合并后的主分支上重跑验证。worktree 上的测试通过，不代表 merge 后的主分支通过（例如分支间契约漂移、依赖变化）。

## 决策

- `git merge` 成功后，Host 在同一 repo 上执行任务 `verifyCommand`（默认 `npm test`）。
- 复用 Host 验证执行器，记录一条 post-merge Verification：命令、exit code、输出、pass/fail、workdir。
- Merge Proposal 增加 `postMergeVerificationId`，Task Room 显示「合并后回归通过/失败」和输出。
- 失败只警告，不自动回滚、不自动撤销 merge；回滚仍需人决定。
- 不 push。

## 考虑过的选项

1. **merge 后不验证**：主分支可能立即坏掉，且没人知道。拒绝。
2. **验证失败自动回滚**：merge commit 可能已被其他人引用，自动 reset 风险高。拒绝。
3. **验证并记录，失败人工处理**（选中）：保留审计，交给人决定回滚。

## 后果

- merge 完成会多一次命令执行（默认 npm test），可能较慢。
- 失败不会阻止 `merged` 状态；Owner 需要看回归结果。
- 验证命令在 repo 根目录跑，不是 worktree；命令必须适合主分支。
- 还没有一键回滚；后续可生成 `git reset --hard <merge>^` 建议。

## 状态

Accepted（2026-10-22）
