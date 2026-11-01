# 从 Super-agent 到 dsh-ai-studio：启示与 v2.7 调整

> 参考文章：DeepSeekHarness《Super-agent 设计探索：迈向更自主的 Agent 系统》  
> https://www.bilibili.com/opus/1265361021143351318  
> 阅读时间：2026-11-01  
> 落地状态：v2.7.0 已实现 Trigger Inbox / Thread；v2.8.0 实现 Workshop Room；v2.8.1 实现 Workshop AI 独立评审；v2.9.0 增加原型 Demo 门禁；v2.10.0 增加 Provider Profiles；v2.11.0 增加 Provider 健康度；v2.12.0 增加失败率、失败原因和备用建议；v2.13.0 增加人工改绑备用 Profile。语义过滤、Webhook、自动 merge 留到后续版本。

---

## 1. 文章在讲什么

文章讨论的不是“再做一个聊天机器人”，而是一个更自主的 Agent 系统架构：

```text
外部事件（IM / GitHub PR / CI / 邮件）
  → 两级过滤（Fast Path / Slow Path）
  → Router 层（共享上下文、路由、对外交互）
  → Worker Session（隔离上下文、并发执行）
  → 执行环境（端侧 daemon / 云端）
  → Session 数据库（持久化状态）
```

核心不是一个“更大的模型”，而是：

- **Router / Worker 分层**：路由层共享上下文，执行层彼此隔离；
- **两级过滤**：先用确定性规则筛掉噪声，再让 LLM 判断语义；
- **Thread**：同一 IM 话题或同一个 PR 下的连续事件是一条线程；
- **订阅与直通**：初始事件创建 Worker，后续同 Thread 事件直接发给它；
- **链式召回**：事件只内联关联对象 ID，按需逐跳展开，不一次塞满上下文；
- **投机执行**：讨论还没结束时，先做可验证的候选动作；
- **异步 ReAct**：工具在后台跑，前台仍能响应新消息；
- **存算分离**：Agent Loop 无状态，状态进数据库，执行环境按需接入；
- **性能度量**：用到达/完成曲线和 Router batch 指标判断系统是否真的更快。

---

## 2. 对 Studio 的启发

### 2.1 Studio 已经有 Worker 隔离，但缺 Router

当前 Studio 的模型是：

```text
Project → Task → worktree → Agent Run → 验证 / 评审 / merge
```

每个 Task 在独立 worktree 里执行，这其实已经是 **Worker 隔离**。  
但 Studio 没有真正的 **Router 层**：

- 任务由人手动创建；
- 没有外部事件入口；
- 没有 Thread 关联；
- 没有“初始事件创建 Worker，后续事件直通”的机制；
- Lead 角色是任务执行者，不是持续在线的路由器。

所以当前 Studio 更像“任务管理系统 + Agent 执行器”，还不是“事件驱动的 Super-agent 工作室”。

### 2.2 最值得补的是 Trigger / Thread，不是更多聊天

文章最重要的启发：

> **不是把多个 AI 拉进一个群聊，而是把事件路由到正确的 Worker，并保持 Thread 连续。**

对应到 Studio：

- `Task` 是工作单元，不是事件；
- 需要 `Trigger`（外部事件）和 `Thread`（同一话题/PR 的事件线）；
- 需要一个 `Lead Router`（或 Router 角色）判断：
  - 这个事件要不要管；
  - 归到哪个 Thread；
  - 创建新 Task，还是发给已有 Task；
  - 是否需要人确认。

### 2.3 两级过滤可以显著省 token

当前 Studio 的所有派单都是人手动发起，所以不存在“被噪声触发”的问题。  
一旦接入 GitHub / CI / IM，就必须先过滤：

1. **程序层**：仓库、来源、标签、作者、是否 @、是否关联 PR；
2. **语义层**：这条消息是不是一个可执行诉求，还是闲聊/已解决/重复。

否则每个群消息都进 Agent，成本和延迟都会失控。

### 2.4 Thread 比 Task 更适合承载“连续上下文”

一个 bug 可能经历：

```text
IM 反馈 → PR 提交 → CI 失败 → Review 评论 → 修复 → 回归
```

这不应该创建 6 个互不相关的 Task，而应该是一条 Thread：

```text
Thread
  ├─ Trigger: IM 反馈
  ├─ Trigger: PR opened
  ├─ Trigger: CI failed
  ├─ Trigger: Review comment
  └─ Trigger: regression passed
```

Task 可以是 Thread 的“执行单元”，但 Thread 负责连续性和上下文。

### 2.5 链式召回适合 Studio 的治理数据

Studio 已经有：

- Task；
- Run；
- Verification；
- Review；
- Decision；
- MergeProposal；
- Module / Contract。

文章提醒：不要把所有东西一次性塞进 prompt。  
更好的方式是：

```text
Task 只带关键 ID
→ 需要时 read_run / read_review / read_decision / read_module
→ 逐跳展开
```

这比“把整个项目历史塞进去”更省 token，也更容易审计“Agent 到底看了什么”。

### 2.6 投机执行要非常小心

文章里的“讨论未结束就提交 PR”很吸引人，但 Studio 的治理边界不同：

- 可以在 worktree 里做 **候选修复 / 草稿 PR**；
- 不能自动 merge；
- 不能绕过 Host 验证、独立评审、Owner 验收；
- 投机执行的结果必须标记为 `speculative`，不能当成已完成。

否则会把“自主”变成“不可审计的自动提交”。

### 2.7 存算分离和 Studio 的关系

Studio 目前是：

- 状态在 `studio.json`；
- 代码在 worktree；
- Agent Loop 在 DSH 进程内。

文章的方向是：

- Agent Loop 无状态；
- Session 状态持久化；
- 执行环境通过 daemon 按需接入。

这对 Studio 的启发不是立刻重写，而是：

- Run / Task / Thread 状态必须可恢复；
- 执行器应可替换（DSH / Claude Code / Codex / 未来的远程 worker）；
- 不要把“正在运行的进程”当成唯一状态源。

---

## 3. 哪些要学，哪些不要照搬

### 要学

- Router / Worker 分层；
- Trigger → Thread → Task 的映射；
- 两级过滤；
- 订阅/直通；
- 链式召回；
- 异步执行与状态持久化；
- 用指标验证系统是否更快。

### 不要照搬

- 不要把所有事件都自动变成代码提交；
- 不要让 Agent 绕过 Owner / 验证 / 评审；
- 不要做“多 AI 群聊 UI”来代替路由；
- 不要在没有 Thread 模型时先做 Workshop；
- 不要为了自主性取消人工 merge。

---

## 4. 对 v2.7 计划的调整

原计划 v2.7 是 Workshop（多 AI 研讨会）。  
看完文章后，我建议调整优先级：

```text
v2.7  Trigger Router（事件入口 + Thread）
v2.8  Workshop（多 AI 研讨）
v2.9  Prototype（Demo 阶段）
v3.0  Provider Profiles / Studio Shell
```

### v2.7 最小范围

- `Trigger`：source、externalId、threadKey、title、body、status；
- `Thread`：把同一话题/PR 的事件串起来；
- `Lead Router`：只做“收件 / 归类 / 建议创建 Task”，不自动写代码；
- 两级过滤的第一层：确定性规则；
- 人工确认后才把 Trigger 变成 Task；
- 后续同 Thread 事件追加到已有 Thread，而不是重复建 Task；
- 所有触发都留审计事件；
- 不自动派单、不自动 merge。

### 为什么先做这个

没有 Trigger / Thread：

- Workshop 仍然是一个孤立聊天；
- PRD 讨论仍然找不到“它对应哪个任务/哪个 PR”；
- 外部事件仍然靠人复制粘贴；
- “自主”只能停留在口号。

先有事件和线程，Workshop 才有上下文可以讨论。

---

## 5. 一句话总结

这篇文章对 Studio 最大的启发不是“让 AI 更自主”，而是：

> **自主性来自 Router / Worker 分层、事件过滤、Thread 连续性和可恢复状态；不是来自更大的群聊。**

Studio 已经有 Worker（Task + worktree）和治理门禁；下一步应该补 **Router + Trigger + Thread**，而不是先堆一个多 AI 聊天界面。
