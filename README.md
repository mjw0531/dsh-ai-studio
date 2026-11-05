# dsh-ai-studio

[![check](https://github.com/mjw0531/dsh-ai-studio/actions/workflows/check.yml/badge.svg)](https://github.com/mjw0531/dsh-ai-studio/actions/workflows/check.yml)

把 DeepSeek Harness 的「一个对话框」变成一间有仪表盘、角色、任务、会议室、验收和合并治理的 AI 工作室。

## 它解决什么问题

Agent 能写代码，但团队真正缺的是：

- 谁在做什么，卡在哪；
- 什么算完成，证据在哪；
- 哪些决定不可逆，谁批准的；
- 代码改动什么时候能合并，谁验证过。

Studio 不替代 Agent，也不替代 Git。它把 Agent 的工作放进可审计的任务和阶段门禁里。

## 四件事

| 能力 | 说明 |
|---|---|
| 工作室仪表盘 | 跨项目预算、优先级、角色负载、风险与交付流 |
| Task Room | 派单、worktree 执行、Host 验证、独立评审、验收证据 |
| 决策台 | 项目级决策、不可逆决定、ADR 草稿与人工落盘 |
| 阶段门禁 | PRD/架构冻结、领域模型、需求决策、变更单 |

核心边界：

- Agent 只能把任务推进到 `review`，不能自己验收；
- Host 验证只写 evidence，不自动勾验收；
- 真实 `git merge` 必须由人触发；
- PRD/架构冻结只能由 Owner 主动创建；
- 冻结后文档变更会让阶段门禁失败，必须出新版本或变更单。

## 5 分钟闭环

1. 安装插件并完全重启 DSH。
2. 打开侧栏「AI 工作室」→「公司」。
3. 新建项目，绑定一个 Git 仓库。
4. 新建任务：写标题，至少一条验收标准；分支、模块、验证命令可留空。
5. 派单 → 在 Task Room 看回执和 diff。
6. 运行 Host 验证 → 独立评审 → 勾验收 → 创建合并提案。
7. 需要时由人在 Task Room 执行真实 `git merge`。

首次使用不需要先配模型；会跟随 DSH 当前默认模型。

## 安装

要求：

```text
DSH >= 0.2.1-rc.2
Node.js 24
pnpm 11
```

### 桌面端

Plugins → Add plugin → 填本地目录：

```text
D:\dsh-ai-studio\packages\dsh-studio
```

Enable now，然后完全退出并重启 DSH。

### Web profile

```powershell
dsh plugin --profile web add "D:\dsh-ai-studio\packages\dsh-studio"
dsh --profile web
```

### 从 tarball 安装

Release 页面下载 `dsh-ai-studio-<version>.tgz`，在 Add plugin 里填 tarball 路径。

升级插件后必须完全退出 DSH 再启动；不需要重装。

## 发布与商店更新

发布链路是：

```text
tag vX.Y.Z
  → GitHub Actions publish
  → npm dsh-ai-studio@X.Y.Z
  → awesome-dsh-plugin 目录刷新
  → dshmarket 更新检查
```

只打 GitHub Release 不会更新市场。市场安装源是 npm。

发布前：

```powershell
pnpm release:check
pnpm check
```

发布 workflow：`.github/workflows/publish.yml`，由 tag 触发，也可以手动指定 tag。

需要仓库 secret `NPM_TOKEN`，且 token 必须对 `dsh-ai-studio` 有发布权限。

npm 发布后，市场目录来自 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)；如果目录未刷新，向该仓库提交条目的 PR，不要向 dshmarket 仓库提交插件。

## 数据放在哪

```text
%USERPROFILE%\.dsh\studio\studio.json   # 状态
%USERPROFILE%\.dsh\studio\runs\         # Run 全文
<项目仓库>\.worktrees\<taskId>          # 每个任务的 worktree
```

- 状态文件不进 Git；
- Run 全文外置，`studio.json` 只留 2 KB 预览；
- 卸载插件不会删除工作室数据；
- 导入/导出在「设置」页，导入前自动备份。

## 常见问题

### 页面 401 或一直转圈

`/studio-api` 需要当前页面注入的进程级 token。刷新页面或重启 DSH；不要手工拼 API URL。

### 安装后侧栏没有「AI 工作室」

1. 确认插件已 Enable；
2. 完全退出 DSH，而不是只关窗口；
3. 打开 Plugins 看是否有加载错误；
4. Web profile 用 `dsh plugin --profile web list` 确认已安装。

### 表单留空报「必须是字符串」

升级到 v3.13.0 或更新版本。旧版本对可选字段的 `null` 处理有 bug。

### 阶段门禁过不去

- 绑定仓库的项目进入 `architecture` 前要冻结 PRD；
- 进入 `development` 前要冻结架构；
- 冻结后改过文档会报漂移，需要创建新版本；
- 检查项没完成时，Owner 可以写豁免理由。

### 任务一直 blocked

看 Task Room 的 Run 错误、Host 验证输出和决策台。连续失败 2 次会升级，不会允许原地第三次重试。

## 文档

- [使用说明书](docs/05-使用说明书.md)
- [兼容性与安装](docs/04-兼容性与安装.md)
- [项目介绍与开发指南](docs/06-项目介绍.md)
- [迭代计划](docs/08-迭代计划.md)
- [设计蓝图](docs/00-设计蓝图.md)
- [架构决策记录](docs/adr/)
- [CHANGELOG](CHANGELOG.md)

## 架构

```text
DSH Web/Desktop
  ├─ 独立页面（client plugin）
  │   Owner Dashboard / Decision Boardroom / Mission Control
  │   Task Room / Merge Queue / Team / Settings
  └─ Host plugin
      ├─ /studio-api（同源、Bearer token、JSON）
      ├─ 文件存储（$DSH_HOME/studio/studio.json）
      ├─ 版本适配（app-boot → 安装包清单 → env）
      ├─ DSH Agent 派单（agents.create + agentPresets.mount + tokenMeter）
      └─ 状态机 / 验收门禁 / 合并治理 / 公司聚合
```

- Host 只依赖公开的 `ctx.webServer`、`ctx.connection`、`ctx.agents`、`ctx.agentPresets`、`ctx.llm`、`ctx.tokenMeter`；
- Client 只依赖 `ctx.slots`、`ctx.layout` 和平台 React；
- 不依赖 DSH 私有 Remote 代码生成器；
- 领域逻辑在 `src/shared` 与 `src/host/store`。

## 非目标

- 不做通用聊天客户端；
- 不自动 merge 或 push；
- 不让 Agent 自己批准决策；
- 不把工作室状态写进项目 Git 仓库；
- 不把外部事件直接当验收结论。

## 版本

当前版本 **3.13.0**。版本历史见 [CHANGELOG](CHANGELOG.md)。
