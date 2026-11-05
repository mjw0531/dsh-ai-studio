# Changelog

所有版本按里程碑记录。当前版本只保留最近五个版本；更早版本见 Git 历史与 `docs/08-迭代计划.md`。

## [3.14.0] - 2026-11-05

### Added

- 会议室质量：参会视角（体验/竞品/技术可行性/反方）、冻结版本绑定、无分歧理由、未闭环标记。
- 纪要强制保留分歧或填写无分歧理由。
- trivial 任务批量勾选验收（仍需 evidence 和最终 done 门禁）。
- 历史数据自动归档到 `history/`。
- schema 35。

### Fixed

- timeout Run 重启校验、冻结决策落盘、重拆票可派单、项目包导入校验。

## [3.13.1] - 2026-11-05

### Changed

- 会议室：新建会议入口移入左侧会议列表底部；说明文字移到标题右侧。
- 会议内容面板改为「会议内容：标题」，支持折叠。
- 聊天区改成横向页签：群聊 + 每个参会角色单聊，点击切换。
- 会议室 AI 仍为只读边界；单聊不进入群聊。

## [3.13.0] - 2026-11-05

### Added

- 独立「会议室」页面：议程、参会角色、群聊点名发言、单聊、结算编辑、AI 纪要、决策草案。
- 会议发言保留原始版本；Owner 编辑不覆盖历史。
- 单聊与群聊隔离；会议纪要不会自动进入开发 Agent 上下文。
- 知识库页面接收 PRD/架构冻结；侧栏顺序调整；新建任务移入任务页。

### Changed

- schema 33 → 34：Workshop 增加 meetingType/agenda/messages/sideChats/minutes/decisionId/settledAt。

## [3.12.0] - 2026-11-04

### Fixed

- 更换项目仓库后，旧的绝对文档路径会自动迁移为仓库内相对路径。
- 文档路径必须相对仓库根目录；绝对路径和越界路径会被拒绝。
- 知识页显示当前仓库根目录；未绑定仓库时给出明确提示。
## [3.11.0] - 2026-11-04

### Changed

- `router.ts` 拆分出 HTTP 基础层、输入解析、鉴权与错误处理，主路由降到 1,000 行以内。
- `styles.ts` 拆分为 base / layout / views 三个样式块。
- README 改为问题、能力、5 分钟闭环、安装排错的顺序。
- 新增 `CHANGELOG.md` 与 `check:docs`，版本号、README、CHANGELOG 不一致时 CI 失败。

## [3.10.0] - 2026-11-04

### Added

- 冻结变更单：关联冻结版本、原因、影响范围，Owner 接受/拒绝。
- schema 33：`freezeChangeRequests`。

## [3.9.0] - 2026-11-04

### Added

- PRD / 架构双冻结：Owner 主动创建版本，记录 SHA-256、领域模型、检查项与未决问题。
- StageGate 绑定冻结版本，文档漂移拒绝进入下一阶段。
- 多 AI 需求决策记录。
- schema 32：`freezes`、`requirementDecisions`、`StageGate.freezeId`。

## [3.8.0] - 2026-11-04

### Added

- 任务级超时；超时状态 `timeout`，任务 blocked，保留 worktree。
- `riskTier`：trivial 任务在 Host 验证通过后可跳过独立评审。
- 回执解析支持多个 JSON 块。
- schema 31。

## [3.7.0] - 2026-11-04

### Changed

- Run 全文外置到 `runs/<id>.txt`，state 只保留 2 KB 预览。
- 回执 JSON 扫描所有 fenced block，并从后往前解析。
- schema 30。
