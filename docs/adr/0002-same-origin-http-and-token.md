# 用同源 HTTP JSON + 页面注入 token，而不是 DSH 私有 Remote 生成器

## 背景

Studio 需要一个 Host ↔ 独立页面的数据通道。DSH 内部业务包使用 Typert Remote 生成器（`@Remote` 装饰器 + 构建期 descriptor + API Gateway），类型安全、支持流和权限，但这套链路依赖 DSH 仓库的代码生成和内部包，对第三方插件既不公开也不稳定。工作台又要求「即装即用」和「适配未来 DSH 版本」。

## 决策

Host 半在 `ctx.webServer` 上注册一个普通前缀路由 `/studio-api`，返回 JSON；页面启动时由 Host 通过结构化 `webserver/index-inject` 注入一个进程级随机 token 和 basePath。浏览器半用同源 `fetch` 调用，除 `/health` 外全部校验 Bearer token。数据写在 `$DSH_HOME/studio/studio.json`。

桌面端是额外情况：渲染器运行在 `dsh-app://` 自定义 scheme 上，热安装时不会重新收集启动注入表，且跨 origin 请求不带 DSH Cookie。因此 0.2.1 增加一个 Boot 回退：`/studio-api/boot` 对 `dsh-app://` / `null` origin 反射 CORS，只返回进程级随机 token；所有数据接口仍然必须携带这个 token。Web 端该路由仍走 `ctx.connection.admit()` 的 DSH 认证。

## 考虑过的选项

1. **Typert Remote**：类型最好，但需要 DSH 构建链、私有包和 descriptor 生成；第三方插件无法稳定复用，升级容易断。
2. **独立 HTTP 端口**：可以完全独立，但多一个端口、CORS、防火墙和生命周期问题；不符合「即装即用」。
3. **同源路由 + 注入 token**（选中）：Web 端零额外端口、同源；桌面端使用一个受控 CORS 的 Boot 回退，只发放进程级 token。核心只依赖 `webServer` 路由、结构化 index injection 和 `connection.admit()`。
4. **只存 session/workspace 现有 API**：不需要新通道，但无法表达项目/角色/任务/验收这些领域对象。

## 后果

- 失去 Typert 的编译期类型和流式能力；用共享 TypeScript 类型 + 运行时校验弥补。
- token 注入和路由鉴权由 Studio 自己负责；token 不能进日志/数据文件。
- 如果未来 DSH 移除 `webServer` 或 index injection，只需替换 `src/host/index.ts` 的传输适配层；`store` 和 `shared` 不动。
- 桌面端同样使用 `dsh-web-app` 的 `ctx.webServer`，因此该方案同时覆盖 Web 和 Desktop；若未来桌面壳改成纯 IPC，需要新增 IPC 适配器。
- `/studio-api` 是 Studio 的私有契约，不承诺给其他插件使用；外部集成应走未来的正式 API。

## 状态

Accepted（2026-10-21）
