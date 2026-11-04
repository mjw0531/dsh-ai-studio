# 0029 运行超时与任务风险分级

## 状态

已接受（v3.8.0）。

## 背景

代码任务原先硬编码 300 秒超时，分析任务 120 秒；超时走 `failRun`，会触发连续失败升级，甚至把实际已接近完成的任务锁死。同时所有任务走同一套评审/合并门禁，trivial 任务也要承担完整评审成本。

## 决策

1. **任务级超时**
   - `Task.timeoutSeconds` 可配置；空值使用默认（分析 120 秒，代码 300 秒）。
   - 超时不再走 `failRun`，而是 `timeoutRun`：Run 状态 `timeout`，任务进入 `blocked`，worktree 保留，不自动提交。
   - 超时不计入“连续失败”升级，交给 Owner 接管。
   - Run 状态新增 `timeout`，UI 有独立标签。

2. **风险分级**
   - `Task.riskTier`: `trivial | normal | critical`，默认 `normal`。
   - `trivial` 任务在已有通过的 Host 验证时，可以跳过独立评审；`normal/critical` 保留完整评审。
   - 合并仍保留人工提案/批准，不自动 merge；trivial 不是绕过验收或证据，只减少评审触点。

3. **schema**
   - 30 → 31；旧 Task 补 `timeoutSeconds: null`、`riskTier: "normal"`。
   - 旧 Run 不需要改字段；`timeout` 是新状态值。

## 影响

- 超时任务不会自动重试或自动提交，必须人工看 worktree。
- trivial 任务的 done 只跳过评审，不跳过验收、evidence、Host 验证。
- 风险分级不改变 Webhook、触发器、合并执行等门禁。

## 非目标

- 不自动 fast-forward/squash 合并；仍走人工合并提案。
- 不让 Agent 自己决定 riskTier；由建任务的人选择。
- 不把超时当成成功。
