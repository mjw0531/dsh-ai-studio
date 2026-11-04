# 0026 执行 Agent 的显式预设与只读边界

## 状态

已接受（v3.4.0）。

## 背景

Studio 的 worker、独立评审和 Workshop Agent 之前调用 `agentPresets.mount(agentCtx)` 时不传预设 ID，实际预设由 DSH 部署默认值决定。默认是 `standard` 时正常；用户把创造模式设为默认后，worker 会拿到 `tool-cordis`、插件管理器和创作能力，Run 记录中看不出来。评审和 Workshop 也只有提示词要求“不要改文件”，没有工具/沙箱硬限制。

## 决策

1. **固定挂载 `standard`**
   - 不新增插件自定义预设，避免插件包与 DSH 预设目录的安装/升级耦合。
   - worker、评审、Workshop 都显式 `mount(agentCtx, "standard")`。
   - 返回的实际 id 必须等于 `standard`，否则 fail closed，不继续创建 Agent。

2. **工具面用 `tools.restrict` 收窄**
   - worker 禁止：`subagent`、`subagent_fork`、`workflow`、`ask_user_question`、goal/schedule/todo 工具、`working_directory`、插件管理器和 Cordis 创作工具。
   - 评审/Workshop 额外禁止：`write`、`edit`、`pwsh`、`bash`、`present`。
   - 限制在 Agent setup 的 agent 作用域内执行，随 Agent 销毁；不修改 profile 全局工具。

3. **只读任务使用 read-only sandbox**
   - 评审和 Workshop 的 session 写 `sandbox/mode: read-only`。
   - 优先调用 `ctx.sandboxPolicy.setSandboxMode`；没有该服务时写 session 事件。
   - worker 显式写 `workspace-write`，不继承部署默认值。

4. **审批策略显式记录**
   - 优先 `ctx.approval.setPolicy(agent, "never")`；没有该服务时写 `approval/policy` 事件。
   - Run 记录 `approvalPolicy: "never"`。

5. **Run 记录运行事实**
   - `AgentRun` 增加 `agentPreset`、`approvalPolicy`、`sandboxMode`、`restrictedTools`。
   - schema 27 → 28；旧 Run 补 `null`/空数组。
   - UI 的 Run 卡片显示实际预设、沙箱、审批和限制工具数量。

## 影响

- 默认/创造模式都不再影响 worker：每次作业固定 `standard`。
- 评审和 Workshop 不能写文件，也不能调用 shell/子代理/插件工具。
- 如果 DSH 不提供 `tools.restrict`，`setup` 直接失败，不创建 Agent；不会退化成无限制运行。
- 不修改 desktop 默认 preset，不把创造模式设为默认。

## 非目标

- 不新增 `studio-worker` / `studio-review` 自定义预设目录。
- 不自动 merge/push。
- 不改变现有角色、任务和合并门禁。
