# 0025 执行层绑定与桌面启动凭据

## 状态

已接受（v3.3.0）。

## 背景

批次 A 复查确认了五个执行层缺口：

- `/boot` 对 `file://`、`Origin: null` 和无条件 `dsh-app://` 发放进程 token；
- 项目包导出/导入使用整份 `StudioState`，导入一个项目会覆盖其他项目；
- `taskId` 直接拼进 `.worktrees/<taskId>`，没有拒绝 `..` 等目录名；
- Run 不记录提交，Proposal 不绑定评审/验证对应的提交，合并可被分支漂移绕过；
- `load()` 把更高 schema 当损坏，备份后 seed；
- merge 只检查全局 Git 身份。

## 决策

1. **桌面 boot 使用进程级 nonce**
   - 拒绝 `file://` 和 `Origin: null`。
   - `dsh-app://` 必须带 `x-dsh-studio-nonce`，与 Host 进程内 nonce 定时安全比较。
   - nonce 只通过 DSH index injection 注入页面。
   - 热装后没有注入时 `/boot` 返回 401，必须完全退出并重启 DSH；不接受重装作为恢复手段。
   - 数据接口仍全部要求 Bearer token。

2. **项目包 formatVersion 2**
   - 只导出目标项目的 `ProjectSlice`（项目、角色、任务、Run、评审、验证、决策、阶段门禁、Trigger、Workshop、Demo、Provider Profile、Module、契约变更、事件）。
   - 导入按项目合并，不替换整份状态。
   - 同 project id 拒绝，要求删除/改名或在新 profile 导入。
   - v1 项目包拒绝，避免静默覆盖。
   - 解压前检查 tar 条目，拒绝绝对路径、盘符路径和 `..`。

3. **taskId 只允许安全目录名**
   - 拒绝空、`.`、`..`、斜杠、盘符和 Windows 保留名。
   - worktree 路径 `resolve` 后必须仍在 `.worktrees` 下。
   - 已存在 worktree 的分支不匹配时拒绝复用。

4. **Run / Proposal 绑定提交**
   - `AgentRun` 增加 `commitSha`、`baseSha`。
   - `MergeProposal` 增加 `sourceCommit`、`baseCommit`、`verificationRunId`、`reviewId`。
   - 代码任务 `done` 要求最新代码 Run 的独立评审；合并提案要求最新验证/评审属于同一 Run。
   - `merge.execute` 检查分支头必须等于 `sourceCommit`；旧提案 `sourceCommit=null` 直接拒绝，必须重新验证/评审/提案。
   - 迁移只补 `null`，不伪造 SHA。

5. **更高 schema 保留不覆盖**
   - `load()` 发现 `schemaVersion` 高于当前版本时保留原文件、设置 warning、不 seed。
   - 仅损坏 JSON 才备份并重建。
   - 测试可用 `DSH_STUDIO_DATA_DIR` 指向临时目录；生产默认路径不变。

6. **merge 只用 repo-local Git 身份**
   - `git config --local --get user.name/user.email`。
   - 缺失时返回 `git_identity_required`，不回退全局配置。

## 影响

- schema 26 → 27；旧 Run/Proposal 字段补 `null`。
- 旧的 `review` / `approved` 合并提案不能执行，必须重新验证、评审、创建提案；`merged` 历史保留。
- 桌面插件热装后需要重启 DSH 才能恢复 Studio 页面；这是有意的 fail-closed。
- v1 项目包需要重新导出为 v2。

## 非目标

- 本批次不实现执行 Agent 的 `studio-worker` 预设和工具/沙箱硬限制（批次 B）。
- 不自动 merge/push。
- 不修改 desktop profile 的默认预设。
