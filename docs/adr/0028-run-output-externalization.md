# 0028 Run 输出外置与回执解析

## 状态

已接受（v3.7.0）。

## 背景

`studio.json` 每次变更都全量重写，而 `AgentRun.output` 保存完整 Agent 输出。运行数百个任务后文件会快速膨胀；同时旧回执解析只取第一个 fenced block 和第一个 `{` 到最后一个 `}`，模型在 JSON 后补一句话或多个 JSON 块时容易误解析。

## 决策

1. **输出外置**
   - 新增 `AgentRun.outputPath`。
   - `completeRun` 后 Host 将完整输出写入 `DSH_STUDIO_DATA_DIR/runs/<runId>.txt`。
   - `studio.json` 只保留前 2,000 字符预览。
   - 外置失败不回滚已完成 Run，只保留预览；这是 best-effort，错误不覆盖运行结果。

2. **回执解析**
   - 扫描所有 fenced code block，再从后往前扫描每个 `{`。
   - 用括号深度和字符串状态找完整 JSON 对象，逐个 `JSON.parse`。
   - 返回最后一个可解析对象，不再用 `indexOf`/`lastIndexOf`。

3. **schema**
   - 29 → 30；旧 Run 补 `outputPath: null`。
   - Run 的 `output` 仍用于 UI 预览，不改变现有读取路径。

## 影响

- 新 Run 的完整输出在 `runs/` 下，可单独 grep/查看。
- `studio.json` 体积不再随输出全文线性增长。
- 旧数据不回填输出文件；旧 Run 继续使用内嵌 `output`。
- 导出 JSON 仍包含预览和路径，不自动打包 `runs/` 文件；项目包也不包含运行时输出。

## 非目标

- 不切换 SQLite。
- 不自动清理旧 Run；滚动归档后续再做。
- 不改变 Agent 回执的 `summary/evidence` 门禁。
