# Studio

基于 DSH 的多角色 AI 工作台：把会话、角色、任务、产物和合并治理组织成一条可审计的工作流。

## Language

### 公司与组合

**Company（公司）**:
Owner 名下的全部 Project、Role 和任务集合；是一个聚合视角，不是独立存储实体。
_Avoid_: 租户、组织（当前尚未多租户）

**Owner Dashboard（公司仪表盘）**:
从 StudioState 派生的公司级视图：项目组合、老板收件箱、角色负载、风险与交付流。
_Avoid_: 项目总览、聊天首页

**Owner Need（老板待办）**:
需要 Owner 决策或解除的异常，例如合并审批、阻塞、缺证据、任务停滞、无人负责。
_Avoid_: 待办、通知（通知不一定需要决策）

**Portfolio（项目组合）**:
公司视角下所有项目的健康、进度、合并与最近活动集合。
_Avoid_: 项目列表（缺少健康与决策语义）

**Role Load（角色负载）**:
某角色当前承担的执行中/待验收任务数量与状态；用于发现过载或闲置。
_Avoid_: 产能（产能还需要真实执行与时间数据）

### 项目与知识

**Project（项目）**:
一个有明确目标、仓库根目录、验收标准和生命周期的产品单元。
_Avoid_: 世界书、工作区（workspace 在 DSH 里另有所指）

**Project Book（项目书）**:
项目知识的检索索引，按触发词、范围、优先级向 Agent 注入条目；不是项目的本体。
_Avoid_: 世界书、知识库（过于宽泛）

**Canon（正典）**:
仓库中由人或授权角色维护的事实来源：代码、PRD、架构、契约、ADR、测试。
_Avoid_: 记忆、上下文

**Artifact（产物）**:
任务产生并可验收的持久对象，例如代码变更、测试报告、ADR、设计稿、构建产物。
_Avoid_: 结果、输出（太泛）

**Decision（决策）**:
由明确权限主体做出并记录理由的选择；技术决策通常落为 ADR。
_Avoid_: 共识、讨论结果

**Branch（支线）**:
一条任务/角色产出的隔离工作线，记录目标、契约键、状态和绑定任务；派单时自动登记。
_Avoid_: 分支（Git 术语容易混淆）、工作区

**Worktree（工作区）**:
绑定 git 仓库后为单个 Task 创建的独立检出目录（`.worktrees/<taskId>`）和分支（`studio/<taskId>`）；Agent 只在这里写代码。
_Avoid_: 分支、沙箱

**Verification（独立验证）**:
由 Host 在 worktree 内执行的一条验证命令及其退出码/输出；通过只写 evidence，不代表验收通过。
_Avoid_: 测试结果（太泛）、Agent 自检

**Contract Change（契约变更）**:
某条支线对某个契约声明的一次变更；同契约不同变更跨支线出现时触发冲突升级。
_Avoid_: diff、提交（代码仓库概念）

**Boardroom（董事会）**:
项目级决策的裁决队列：Agent 或人提出，Owner 批准/拒绝，保留结论、理由与 token 成本。
_Avoid_: 审批流、待办

**Owner Decision（老板决定）**:
只有 Owner 能做出的项目级结论；Agent 的建议只是输入，不能替代决定。
_Avoid_: Agent 决策、自动批准

### 组织与执行

**Role（角色）**:
一组持久的职责、决策权、能力边界和交付契约；可以被人或 Agent 担任。
_Avoid_: 员工、人物卡

**Agent（智能体）**:
某个 Role 的一次运行实例，绑定 DSH 会话、工作目录、预设、预算和租约。
_Avoid_: 员工、角色（两者不是一回事）

**Agent Run（运行记录）**:
一次派单的持久记录：会话、模型、状态、token、输出和结构化回执；失败也保留，用于审计与成本。
_Avoid_: 任务、日志（日志不是领域对象）

**Receipt（回执）**:
Agent 交回的结构化结果：`summary / evidence / artifacts / decisions / contractDeltas / rejectedOptions / blockers`；必须至少有一条 evidence 才能进入验收。
_Avoid_: 总结、聊天记录

**Token Budget（token 预算）**:
Owner 给项目或角色设定的 token 上限；分单任务与每日两种，超限要告警/阻断。
_Avoid_: 薪资（薪资是比喻，预算才是领域词）

**Role Card（角色卡）**:
Role 的可编辑声明格式，描述使命、职责、非目标、决策权、能力、交付契约。
_Avoid_: 人物卡、人设

**Runtime Preset（运行时预设）**:
由 Role Card 和项目政策编译出的 DSH Agent Preset：模型、提示段、工具、技能、上下文策略。
_Avoid_: 预设（歧义）、配置面

**Task Kind（票类型）**:
新建型（red→green）或改修型（先诊断/计划再动代码）的任务意图；决定验收和失败回路。
_Avoid_: 类型、标签

**Module（模块）**:
任务所属的功能边界；用于把 Agent 上下文喂窄到模块契约，而不是整份 PRD。
_Avoid_: 目录、文件

**Contract Card（契约卡）**:
模块的职责、接口摘要、允许/禁止路径和依赖；实现者只按契约卡工作，改契约本身要另开决策/ticket。
_Avoid_: 文档、注释

**Contract Violation（契约越界）**:
代码 Run 改动了契约文件、禁止路径，或越出允许的 src/test 路径；Task 必须 blocked 并生成决策。
_Avoid_: 普通冲突、代码错误

**Project Knowledge（项目知识）**:
PRD / INVARIANTS / MODULES 等项目级文档，只读保存在仓库里；Studio 只引用路径，不复制第二份正文。
_Avoid_: 知识库、世界书

**Task（任务）**:
有目标、输入、产物、验收标准、依赖、负责人和分支的工作单元。
_Avoid_: 待办、消息、会话

**Integration Ticket（集成票）**:
把若干个已完成任务合成一个可玩 build，并做人玩验收；用 `integration` 标记，不替代单任务验收。
_Avoid_: 总任务、发布

**Re-split Ticket（重拆票）**:
连续失败 2 次后由系统为 Architect 生成的 backlog 任务，目标是重拆任务/契约，而不是继续写业务代码。
_Avoid_: 重试、修复票

**Independent Review（独立评审）**:
由验收人角色另开 Agent 会话，只读 diff 与 Host 验证结果，给出 pass/fail 和 findings；代码任务 done 前必须有通过评审。
_Avoid_: 自测、验收（Review 是验收的一部分）

**Integration Gate（集成分期）**:
每完成 3 个任务自动生成的 backlog 集成/playtest ticket；要求打包可玩并人玩 10 分钟，不自动派单。
_Avoid_: 自动发布、总验收

**Docs Sync（文档同步）**:
项目绑定 PRD/INVARIANTS/MODULES 时，任务 done 前由执行者/验收者确认文档已更新；只是勾选，不自动改写文档。
_Avoid_: 文档自动生成

**Irreversible Decision（不可逆决策）**:
`reversible=false` 的项目级决策；批准时必须写明结论和理由，不能只点同意。
_Avoid_: 重要决策（所有决策都重要，但只有部分不可逆）

**Merge Execution（合并执行）**:
人批准提案后，由 Host 在干净仓库、当前 base 分支上执行的 `git merge --no-ff`；冲突自动 abort，不 push。
_Avoid_: 自动合并、自动发布

**Run（运行）**:
一个 Agent 对某个 Task 的一次尝试；可失败、重试、换人。
_Avoid_: 任务（Task 可以有很多 Run）

**Branch（工作分支）**:
某个 Task 对应的 Git 分支/工作树、产物集合和验收记录的合称；不是对话分支。
_Avoid_: 支线对话、会话分支

**Done（已完成）**:
任务的验收门禁已通过（验收项完成 + 证据齐全）；不等于已经合入主干。
_Avoid_: 已合并、已发布

**Merge Proposal（合并提案）**:
请求把 Branch 合入主干的提案，包含摘要、风险、回滚、评审备注和合并提交。
_Avoid_: 合并请求（容易和 GitHub PR 混淆，可用 PR 作为实现载体）

**Merge Governance（合并治理）**:
对合并提案进行评审、批准、打回和合并记录的状态机；当前只记录治理事实，不自动执行 Git。
_Avoid_: 自动合并、Git 集成

**Receipt（回执）**:
执行方给派单方的结构化结果消息：结论、证据、产物路径、剩余问题。
_Avoid_: 汇报、通知

### 治理

**Policy（政策）**:
确定性规则：能力、路径、预算、审批、合并门禁；由系统执行，不靠 Agent 自觉。
_Avoid_: 规矩、提示词

**Hook（钩子）**:
生命周期上的确定性中间件，例如 before_tool、before_merge；正则只是其中一种实现。
_Avoid_: 正则、控制面

**Room（房间）**:
对同一项目状态的一种 UI 视图（Mission Control、Task Room、Review Room）；不是独立记忆体。
_Avoid_: 场景（容易暗示独立会话和独立记忆）

**Owner（所有者）**:
人类最终决策者，持有方向、预算、不可逆选择、安全与权限的最终权力。
_Avoid_: 机主（口语可用，文档统一用 Owner）

**Acceptance（验收）**:
用可复现证据判断 Task 是否满足标准；Agent 不能自验收。
_Avoid_: 完成、做完

**Trunk（主干）**:
持续集成、可发布的主线；所有 Branch 最终要回到这里。
_Avoid_: 主线对话

**Lease（租约）**:
Task 或 Branch 在某段时间内归某个 Agent 独占的声明，带心跳和过期回收。
_Avoid_: 锁（Lease 有超时和回收语义）
