# 项目包：状态 + Git bundle + 校验和，导入必须显式指定空目录

## 背景

`studio.json` 只含治理状态，代码和文档在项目仓库；只复制其中一份都不能完整迁移。直接复制整个工作目录又会带绝对路径、`.worktrees` 和未提交改动。

## 决策

- 导出 `Project Bundle`（tar.gz）：
  - `studio.json`：完整状态；
  - `project.bundle`：`git bundle --all`；
  - `manifest.json`：kind、formatVersion、项目、schema、插件/DSH 版本、SHA-256；
  - `README.txt`：迁移说明。
- 导入由人触发，必须提供项目包绝对路径和目标仓库目录。
- 目标目录不存在或为空时才允许 clone；不覆盖已有目录。
- 先校验 manifest 和 SHA-256，再 clone，再导入状态并重绑 `repoPath`。
- 导入状态前自动写 `studio.json.pre-import-*` 备份。
- 不包含 API Key、token、`.worktrees` 或未提交文件。
- 活跃任务第一次派单时，如果本地没有任务分支、但存在 `origin/studio/<taskId>`，从远程分支重建 worktree。

## 考虑过的选项

1. **只导出 studio.json**：缺代码/文档。拒绝。
2. **直接复制整个项目目录**：绝对路径、worktree 和未提交内容不可靠。拒绝。
3. **状态 + git bundle + 校验和**（选中）：可审计、可重绑、可拒绝损坏包。

## 后果

- 当前导入需要手动输入本地绝对路径，还没有目录选择器。
- Git bundle 不含未提交的 worktree 内容；导出前应先提交或接受丢失。
- 外部 CLI 登录态不在包内，新机要重新登录。
- 兼容性仍只实测 DSH `0.2.1-rc.2`；更高版本是尽力兼容。

## 状态

Accepted（2026-10-22）
