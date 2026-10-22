# ADR 落盘与合并回滚都必须人工触发

## 背景

v1.5 的 ADR 草稿只存在 Decision 记录里；v1.7 的合并失败决策只给文本建议。两者都需要“可执行”的收尾：把 ADR 写进仓库、把坏掉的 merge 回退。但自动写文件和自动 reset 都有风险。

## 决策

### ADR 落盘

- 只有人工点击“写入 docs/adr”才执行。
- Host 在项目 repo 的 `docs/adr/` 里取下一个四位编号，文件名 `NNNN-<decisionId>.md`。
- 幂等：已有 `adrPath` 直接返回，不重复写。
- 不覆盖已有文件；不自动提交。

### 合并回滚

- 只有 `merged` 且 post-merge 回归失败的提案可回滚。
- 要求当前分支 = base、工作区干净。
- 执行 `git revert --no-edit <mergeCommit>`，记录新的 rollback commit。
- 不 `reset`、不 force push、不自动提交消息。
- 冲突时 `git revert --abort` 并报错。

## 考虑过的选项

1. **自动写 ADR/自动 revert**：不可控，且可能覆盖/改写历史。拒绝。
2. **只给文本建议**：没有可执行收尾。拒绝。
3. **人工触发 + 严格前置检查**（选中）：保留人的决定权，Host 执行可审计操作。

## 后果

- ADR 编号可能因并发写而冲突（单用户场景可接受）。
- 回滚是 revert commit，不是删除历史；适合已 push 的场景。
- 回滚只处理回归失败的 merge；正常 merge 不提供一键回滚。
- 没有自动提交/推送；用户仍需 review 和 push。

## 状态

Accepted（2026-10-22）
