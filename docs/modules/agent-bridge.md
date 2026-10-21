# agent-bridge

**一句话职责：** 用只监听本机的鉴权 HTTP 与 Electron IPC 把 MCP 请求转发给可信 Renderer。

## 接口

- 启动时生成随机 token，并写入用户数据目录与临时目录的 `agent-bridge.json`。
- `GET /health`：返回桥接协议版本和应用版本。
- `POST /invoke`：接收 `{ method, params }` 并转发给 Renderer 的 `skinAgentSession.dispatch`。
- `Authorization: Bearer <token>` 必须匹配当前进程 token。
- 只接受白名单方法；Renderer 不可用时返回 `EDITOR_NOT_READY` 或超时错误。

## 输入

- Electron 主窗口已创建并加载本地页面。
- `preload.cjs` 已向 Renderer 暴露 `onRequest` / `respond`。
- **前置条件**：请求体为合法 JSON，且大小不超过 64 MB。

## 输出

- 成功返回 `{ ok: true, result }`。
- 失败返回 `{ ok: false, error: { code, message, details } }`。
- **后置条件**：响应不会暴露 token；编辑器关闭时删除 discovery 文件并拒绝挂起请求。

## 依赖模块

- `skin-agent-session`
- Electron `ipcMain`
- Electron `preload`

## 副作用 / 外部资源

- 创建和关闭本机回环 HTTP server。
- 读写 discovery JSON 文件。
- 在主进程与 Renderer 之间传递请求和响应。

## 非功能

- 仅绑定 `127.0.0.1`。
- 每次启动生成新 token。
- 单请求超时 120 秒。
- 不提供任意 JavaScript、Shell 或文件系统执行接口。

## 深度评估

- MCP 客户端只需知道版本化 HTTP 契约，不依赖 Electron IPC 细节。
- 删除该模块会迫使 MCP 进程直接控制 UI 或复制 Renderer 状态。
- 自检结论：保留为主进程侧的薄桥接模块。

## 复用状态

- implemented
