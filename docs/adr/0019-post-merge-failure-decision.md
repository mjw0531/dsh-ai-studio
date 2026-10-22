# 合并后回归失败升级为决策，不自动回滚

## 背景

v1.6 会记录 post-merge 回归结果，但失败只显示在 Task Room，不会进入董事会。主分支可能已经坏掉，却没人被正式通知。

## 决策

- post-merge Verification 失败时，Host 自动创建一条待裁决 Decision：
  - 标题「合并后回归失败：<task>」；
  - context 包含 merge commit、命令、exit code、输出摘要；
  - 选项：回滚 / 保留并修复；
  - 建议给出 `git revert <commit>` 或 `git reset --hard <commit>^`。
- 同一 task 只生成一次（按标题去重）。
- 不自动回滚、不自动 push；Owner 决定。
- Decision 的 `reversible=true`，因为回滚仍是可执行选项。

## 考虑过的选项

1. **只记录 Verification**：失败停留在 Task Room，没人负责。拒绝。
2. **自动 reset 主分支**：可能覆盖其他人的提交，风险高。拒绝。
3. **失败升级为决策 + 人决定**（选中）：既有审计又保留控制权。

## 后果

- 主分支回归失败会出现在董事会，需要 Owner 处理。
- 回滚建议是文本，不会自动执行。
- 同一任务重复 merge 失败只生成一条决策；后续需要手动清理。
- 还没有自动回滚/一键 revert；v1.8 再考虑。

## 状态

Accepted（2026-10-22）
