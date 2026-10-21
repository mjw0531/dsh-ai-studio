# AGENTS.md

Studio 是 DSH 的即装即用工作台插件。改领域词、工作流或接口前，先读 [CONTEXT.md](CONTEXT.md) 和 [设计蓝图](docs/00-设计蓝图.md)。

## 不可破坏的约束

- **完成门禁**：任务进入 `done` 前，所有 acceptance 必须为 done，且至少有一条 evidence。不要在 UI 或 API 里绕过 `StudioStore.transitionTask`。
- **v0.1 边界**：Host 只依赖 `ctx.webServer`；Client 只依赖 `ctx.slots`、`ctx.layout` 和平台 React。不要引入 DSH 私有 Remote 代码生成器，也不要把 `features.agentExecution` / `features.gitMerge` 改成 true 来假装功能已接入。
- **鉴权**：`/studio-api` 除 `/health` 外都必须校验进程内随机 Bearer token；token 只注入当前页面，不写日志、不进数据文件。
- **数据兼容**：`StudioState.schemaVersion` 变更必须提供迁移或明确的破坏性说明；`studio.json` 是本地事实来源，损坏时备份而不是静默覆盖。
- **术语**：使用 `Role`（角色契约）、`Agent`（运行实例）、`Task`、`Branch`、`Acceptance`、`Evidence`；不要把世界书/人物卡/群聊当成本项目的领域词。

## 代码地图

- 跨端类型、状态机、标签：`packages/dsh-studio/src/shared/types.ts`
- 文件存储、验收门禁：`packages/dsh-studio/src/host/store.ts`
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
