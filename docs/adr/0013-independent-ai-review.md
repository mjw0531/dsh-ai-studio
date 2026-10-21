# 独立评审由验收人 Agent 只读 diff 与 Host 验证

## 背景

v1.0 的代码任务可以靠 Host 验证和人工勾验收完成；实现者仍然可以“自己写测试、自己说通过”。工作流评审要求验收独立：不同角色/模型，必须自己看证据，不接受实现者转述。

## 决策

- Task Room 增加「独立评审」：用任务的 `reviewerRoleId` 创建独立 Agent 会话。
- 评审 Agent 的 cwd 是任务 worktree，但 prompt 明确只读；不改文件、不跑写命令。
- 输入只包含任务、验收标准、diff、Host 验证命令/输出；不喂实现者推理。
- 输出固定 JSON：`verdict(pass|fail)`、`summary`、`findings`。
- 评审记录模型、token、findings，pass 时写入 evidence。
- 代码任务（存在 worktree Run）done 前必须有一条通过评审，否则 `review_required`。
- 评审 Agent 使用验收人的模型路由，通常与实现者不同；不强制不同厂商，避免没有可用模型时卡死。

## 考虑过的选项

1. **只靠 Host 命令验证**：能证明测试通过，但不能判断 diff 是否满足验收/是否越界。拒绝。
2. **让实现者自评**：动机冲突，且会复述自己的推理。拒绝。
3. **独立 Agent 只读评审**（选中）：能看 diff/输出，且有独立上下文；成本可控。

## 后果

- 代码任务多一次模型调用（约 2 万 token）；换来独立结论。
- 评审 Agent 的 shell 也可能被 Windows ACL 挡住；它必须如实报告“无法亲手复跑”，不能假装跑过。
- 评审结论是建议 + 门禁：pass 才能 done，但 Owner 仍可退回/拒绝。
- 没有跨厂商强制；同一模型家族仍可能共享盲点。

## 状态

Accepted（2026-10-22）
