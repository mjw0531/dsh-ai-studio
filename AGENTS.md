# AGENTS.md

Studio 是 DSH 的即装即用工作台插件。改领域词、工作流或接口前，先读 [CONTEXT.md](CONTEXT.md) 和 [设计蓝图](docs/00-设计蓝图.md)。

## 不可破坏的约束

- **完成门禁**：任务进入 `done` 前，所有 acceptance 必须为 done，且至少有一条 evidence。不要在 UI 或 API 里绕过 `StudioStore.transitionTask`。
- **合并门禁**：只有 `done` 任务能提交合并提案；提案必须经过 `review → approved → merged`。`merged` 是治理记录，不是 Git 事实；不要在未经明确设计的情况下自动执行 `git merge`。打回提案会把任务退回 `running`。
- **v1.9.0 边界**：Host 只依赖 `ctx.webServer` 的路由/结构化 index injection、`ctx.connection.admit()`、公开的 `ctx.agents` / `ctx.agentPresets` / `ctx.llm` / `ctx.tokenMeter`；Client 只依赖 `ctx.slots`、`ctx.layout` 和平台 React。不要引入 DSH 私有 Remote 代码生成器，也不要把 `features.agentExecution` / `features.gitMerge` 改成 true 来假装功能已接入。
- **Agent 回执门禁**：Agent 只能把任务推进到 `review`；回执必须包含非空 `summary` 和至少一条 `evidence`，否则 Run 记为 failed、任务退回 `ready`。
- **worktree 门禁**：绑定仓库的派单必须在 `.worktrees/<taskId>` 的独立 worktree 内执行，分支为 `studio/<taskId>`；Agent 不得 merge/push 或改主工作区。测试命令被 Windows ACL 阻断时，Run 必须如实记录 blocker，不能伪造测试通过。
- **独立验证门禁**：验证命令由 Host 在 worktree 内执行，退出码和输出必须持久化；通过只写 evidence，不自动勾验收项、不自动 done。
- **失败与合并门禁**：同一 task 连续失败 2 次必须 blocked 并生成决策，不允许第三次原地重试；代码项目没有通过的 Host 验证不能提交合并提案。
- **契约门禁**：代码 Run 改动模块契约文件、禁止路径，或越出允许的 src/test 路径时，必须 blocked + 「契约越界」决策；不能静默接受。
- **闭环门禁**：连续失败 2 次必须同时生成 Architect 重拆 ticket（backlog），不能只留决策；集成/playtest ticket 用 `integration` 标记。
- **评审门禁**：代码任务（有 worktree Run）done 前必须有验收人角色的独立评审 pass；评审只读，不改代码。
- **集成门禁**：每完成 3 个任务必须自动生成一张 backlog 集成/playtest ticket；只生成一次，不自动派单。
- **文档门禁**：项目绑定 PRD/INVARIANTS/MODULES 时，任务 done 前必须 `docsSynced=true`。
- **不可逆门禁**：`reversible=false` 的 Decision 批准时必须写结论和理由，否则拒绝。
- **合并执行门禁**：真实 `git merge` 只能由人触发；要求 approved、当前在 base、工作区干净、分支存在；冲突必须 abort，禁止自动 push。
- **ADR 草稿门禁**：不可逆决策批准后生成 Markdown 草稿保存于 Decision，不自动写仓库；写文件必须由人确认。
- **合并后回归门禁**：merge 成功后必须在 repo 执行任务验证命令并持久化结果；失败只警告，不自动回滚。
- **合并失败升级门禁**：post-merge 回归失败必须生成董事会决策（附 commit/回滚建议），同一任务只生成一次。
- **ADR 落盘门禁**：只有人工触发才写 `docs/adr/`；自动编号、幂等，不覆盖已有路径。
- **回滚门禁**：只有 merged 且 post-merge 回归失败的提案可回滚；用 `git revert`，不 reset/push。
- **改修票门禁**：`kind=fix` 必须有非空 `diagnosis` 和 `plan` 才能派单；新建型不受影响。
- **决策门禁**：项目级决策只能由 Owner 在董事会批准/拒绝；Agent 只能提出建议，不能替 Owner 决定。决策必须保留结论和理由，批准后不得静默改写。
- **支线门禁**：派单时自动登记 Branch；Agent 的 `contractDeltas` 写入 `contractChanges`。两条支线改同一契约且内容不同时，必须自动生成待裁决 Decision，不能静默合并。
- **公司聚合是派生视图**：Owner Dashboard 的 `company` 必须从 `StudioState` 计算，不能成为第二份事实来源；金额成本没有真实报价时显示“待接入”，token 消耗必须来自 DSH meter。
- **桌面启动参数**：桌面渲染器是 `dsh-app://` 自定义 scheme，不能依赖 DSH Cookie 或 startup injection 的热更新。保留 `/studio-api/boot` 的桌面 origin 回退；它只发放进程级 token，绝不能把数据接口改成免 token。
- **鉴权**：`/studio-api` 除 `/health` 外都必须校验进程内随机 Bearer token；token 只注入当前页面，不写日志、不进数据文件。
- **数据兼容**：`StudioState.schemaVersion` 变更必须提供迁移或明确的破坏性说明；`studio.json` 是本地事实来源，损坏时备份而不是静默覆盖。
- **术语**：使用 `Role`（角色契约）、`Agent`（运行实例）、`Task`、`Branch`、`Acceptance`、`Evidence`；不要把世界书/人物卡/群聊当成本项目的领域词。

## 代码地图

- 跨端类型、状态机、标签：`packages/dsh-studio/src/shared/types.ts`
- 文件存储、验收门禁：`packages/dsh-studio/src/host/store.ts`
- Agent 派单、回执归一化：`packages/dsh-studio/src/host/dispatcher.ts`
- HTTP API、token 校验：`packages/dsh-studio/src/host/router.ts`
- Cordis 挂载、boot payload：`packages/dsh-studio/src/host/index.ts`
- 版本适配：`packages/dsh-studio/src/host/compat.ts`
- 独立页面：`packages/dsh-studio/src/client/StudioPage.tsx`
- DSH 插槽注册：`packages/dsh-studio/src/client/index.tsx`
- 单测：`packages/dsh-studio/tests/store.test.mjs`
- 端到端脚本：`tools/cdp-check.mjs`、`tools/cdp-flow.mjs`、`tools/cdp-create.mjs`

## 验证

```powershell
pnpm typecheck
pnpm build
pnpm test
```

UI/API 改动还要做一次隔离 profile 的端到端烟测：

1. `dsh --profile studio-test --no-open --port 0`
2. 用打印的 URL 跑 `tools/cdp-check.mjs`，确认页面和侧栏「工作台」出现。
3. 不要为了测试去改用户的 `desktop` profile；桌面端安装由 Plugins 页面完成。

## 决策记录

- 难逆、反直觉、有真实取舍的选择写 `docs/adr/NNNN-*.md`。
- 领域词变化时同步更新 `CONTEXT.md`；不要在两处维护同一份定义。
