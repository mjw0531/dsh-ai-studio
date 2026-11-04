# 0030 PRD 与架构双冻结

## 状态

已接受（v3.9.0）。

## 背景

PRD 阶段缺少收敛判据：可以无限“完善”，架构设计没有稳定输入；PRD 到架构缺少领域模型翻译层；多 AI 建议的采纳/否决不可审计；架构设计缺少质量检查。

## 决策

1. **双冻结**
   - PRD vN 在进入 `architecture` 前由 Owner 主动冻结。
   - 架构 vN 在进入 `prototype/development` 前由 Owner 主动冻结。
   - AI 只能建议，不能触发冻结。

2. **冻结内容**
   - `ProjectFreeze` 保存 kind、version、docPath、docHash、domainModelPath、summary、openQuestions、checklist、waiverReason、frozenBy/At。
   - PRD 正文仍在仓库，`studio.json` 只存路径和 SHA-256。
   - PRD 冻结必须登记领域模型路径，且文件存在。

3. **Hash 漂移**
   - `assertFreezeCurrent` 读取最新冻结文档并重新计算 Hash。
   - 文档在冻结后修改 → `freeze_drift`，StageGate 不能通过。
   - 修改走新版本 + Change Request，不改旧版本。

4. **StageGate 绑定**
   - 进入 architecture 要求最新 PRD 冻结且 Hash 一致。
   - 进入 development 要求最新架构冻结且 Hash 一致。
   - 门禁记录 `freezeId`。
   - 没有绑定仓库的分析项目不强制冻结；仓库路径不存在的旧数据不阻断门禁。

5. **领域模型与检查表**
   - PRD 冻结要求 `domainModelPath`。
   - 冻结 checklist 覆盖核心循环、范围、验收、领域模型、未决问题、追溯。
   - 架构冻结 checklist 覆盖模块边界、依赖方向、失败模式、测试策略、首切片风险。

6. **需求决策**
   - `RequirementDecision` 记录来源、建议、结论、理由、关联冻结版本。
   - 多 AI 建议只是输入，不替代 Owner。

## 影响

- schema 31 → 32：新增 `freezes`、`requirementDecisions`，StageGate 增加 `freezeId`。
- 旧项目没有冻结；下次进入 architecture/development 时才要求冻结。
- 旧 StageGate `freezeId` 补 `null`。

## 非目标

- 不自动冻结。
- 不改 PRD 全文存储方式。
- 不做完整变更单状态机；B3 只记录变更需求，后续批次扩展。
