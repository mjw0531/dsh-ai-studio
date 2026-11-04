# 0027 API 边界的空值与验证命令来源

## 状态

已接受（v3.5.0）。

## 背景

外部用户首次安装后，在任务表单留空「分支」，前端发送 `branch: null`，后端 `asOptionalString` 只接受 `undefined` 或字符串，直接返回 400。TypeScript 两端各自类型自洽，断裂只发生在 JSON 边界。

同时，`/studio-api/tasks/:id/verify` 接受请求体里的任意 `command`，在用户已登录的 Bearer token 下可以在 worktree 执行任意命令。审计把它列为从网页 token 泄露到任意命令执行的链路之一。

## 决策

1. **可选字段统一接受 `null`**
   - `asOptionalString` / `asStringArray` / `asOptionalBudget` 都把 `null` 当作“未提供”。
   - 空字符串和纯空白字符串归一为 `undefined`。
   - 错误文案说明“留空可省略或传 null”，不再把用户没填的字段说成类型错误。

2. **前端不再把空值显式序列化为 `null`**
   - 任务、项目、角色表单中的可选文本字段发送 `undefined`（JSON 会省略该键）。
   - 必填 ID 的 `null` 语义保留，由 store 校验。

3. **验证命令只有一个来源**
   - `/verify` 不再接受请求体 `command`；它只执行任务上已保存的 `verifyCommand`。
   - UI 修改命令时先 `PATCH /tasks/:id` 保存 `verifyCommand`，再调用 `/verify`；修改会进入任务更新审计。
   - 直接在 `/verify` 传 `command` 返回 400 `verify_command_override`。

4. **认证与限流**
   - Bearer 比较改为 `timingSafeEqual`，不再使用普通字符串比较。
   - `/boot` 与 `/verify` 增加固定窗口限流（每 IP 每分钟 30 次）；超限返回 429。

5. **CI 校验**
   - GitHub Actions 运行 typecheck/test/build，并检查 `packages/dsh-studio/lib` 与 `src` 构建结果一致。
   - 不允许 `src` 改了而 `lib` 没重建。

## 影响

- 旧客户端如果直接在 `/verify` 传 `command` 会收到 400；应先更新任务。
- 可选字段为 `null` 的请求不再 400。
- 首次冷启动路径有回归测试；干净 profile 仍需在发布前人工走一次。

## 非目标

- 不放开任意命令白名单；命令仍由任务配置，属于 Owner 的显式操作。
- 不把 verify 改成自动执行；仍由人触发。
