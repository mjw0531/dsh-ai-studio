# 验证由 Host 在 worktree 执行，Agent 自检不算证据

## 背景

v0.6.0 的 Agent 能改代码，但 Windows 沙箱在部分 worktree 上无法配置写 ACL，导致 Agent 启动 shell 失败；同时让实现者自己跑测试并自报通过，会写出“能通过的测试”，无法独立证明。

## 决策

- Task 增加 `verifyCommand`；默认 `npm test`。
- Task Room 的“独立验证”由 Studio Host 在任务 worktree 内直接执行命令，记录 exit code、输出、工作目录、关联 Run。
- 通过只写 evidence，**不自动勾验收项、不自动把任务变为 done**。
- Merge Proposal 记录 `diffStat / changedFiles / verificationId`，评审时能看到真实改动和验证结果。
- Agent 自己跑的测试仍可作为参考，但不替代 Host 验证。

## 考虑过的选项

1. **只信 Agent 自报测试结果**：不可验证，且实现者有动机写“能过的测试”。拒绝。
2. **只让人类手工跑**：可信，但不可复现、无审计、容易忘。拒绝。
3. **Host 执行 + 人类验收**（选中）：机器证据独立于实现者，最终验收仍由人/Verifier 决定。

## 后果

- 验证命令是本机执行，必须由项目信任配置；命令注入风险由 Owner 权限承担。
- 验证失败不会自动阻塞任务，但会作为证据显示，供 Owner/Verifier 判断。
- 验证只覆盖命令能证明的部分；表现、手感、可玩性仍需人玩。
- v0.6.1 没有“验证不通过就不能提交合并提案”的硬门禁；留待 v0.7。

## 状态

Accepted（2026-10-22）
