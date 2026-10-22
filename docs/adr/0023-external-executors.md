# 外部执行器：Claude Code / Codex 只做 worktree 内的 headless 执行

## 背景

角色不能只绑定 DSH 内部模型；用户需要让架构师用 Claude Code、实现者用 Codex，或使用其它 CLI 工具。但 Studio 的目标不是重写一套 Agent 运行时。

## 决策

- Role 增加 `executor`：`dsh`、`claude-code`、`codex`。
- `dsh` 继续走 DSH 的 `ctx.llm` / `ctx.agents`。
- 外部执行器只在已绑定的项目 worktree 内运行，命令固定、headless：
  - Claude：`claude -p --output-format json --permission-mode acceptEdits`
  - Codex：`codex exec --json -s workspace-write --output-last-message <tmp> -`
- 外部工具的输出仍归一化为 Studio 回执；缺 `summary/evidence` 时 Run 失败。
- Host 仍然自动提交改动、执行契约检查、Host 验证和独立评审；外部工具不能绕过这些门禁。
- 外部 CLI 的登录态由用户在本机维护；Studio 不保存 CLI 的 token。
- Cursor 只有 IDE 启动器，没有 headless Agent，不接入。

## 考虑过的选项

1. **在 Studio 里直接实现模型 API 工具循环**：工作量大，且和 DSH 的 Agent 能力重复。暂不做。
2. **只支持 DSH 模型**：无法满足 Claude Code / Codex 的使用方式。拒绝。
3. **外部 CLI headless + 同一回执门禁**（选中）：复用已有工具，保持治理边界。

## 后果

- 外部执行器的成本/用量不一定能进 DSH token meter；Run 的 tokens 可能为空。
- 外部 CLI 行为受其自身版本、权限和登录态影响。
- 直接填 GPT/Claude/GLM/Kimi API Key 的 ProviderProfile UI 仍未实现；当前要么在 DSH 配 Provider，要么用 CLI 登录态。
- 外部执行器没有在本机完成真实任务，因为两个 CLI 都未登录；这是 v2.6 的验证项。

## 状态

Accepted（2026-10-22）
