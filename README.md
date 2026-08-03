# Codex Web

## 中文

Codex CLI 的轻量 Web UI，无 npm 依赖，使用 Vue 3 CDN，并通过 WebSocket 直接调用 Codex App Server 的 JSON-RPC 接口。

前端文件按职责拆分为 `index.html`、`style.css` 和 `app.js`。

### 运行

执行启动脚本：

```sh
./start.sh
```

脚本默认启动 `codex app-server --listen ws://127.0.0.1:4500`，等待 App Server 就绪后，以 Python 服务托管页面至 `http://127.0.0.1:8080`。

如需使用从 Codex fork 的其他兼容工具，请编辑 `start.sh` 顶部的 `CODEX_CMD` 默认值。

若 4500 端口已有监听进程，脚本会复用该进程，不会停止它。按 `Ctrl-C` 会停止 Python 服务，并清理由脚本启动的 App Server。

浏览器连接 Python 服务的 `ws://127.0.0.1:8080/app-server`，由它转发到 App Server，以避免浏览器 `Origin` 请求头被 App Server 拒绝。

### 已实现

- 使用 `thread/list` 加载真实会话列表。
- 使用 `thread/read` 读取选中会话的历史消息。
- 使用 `thread/start` 创建会话，并将可选工作目录作为 `cwd` 传递。
- 使用 `thread/name/set` 保存会话名称。
- 使用 `turn/start` 发送消息并流式显示回复。
- 使用 `model/list` 加载模型，并选择 model 和 reasoning effort。
- 使用 `turn/interrupt` 停止当前回复。
- 使用 `thread/archive` 归档会话。
- 历史会话仅在发送新消息时通过 `thread/resume` 按需加载。
- `agentMessage.phase === "commentary"` 展示思考过程，`final_answer` 展示正式回复。
- 内置基础 Markdown 渲染，包括标题、段落、引用、列表、链接、粗斜体、代码块和表格。
- 本地路径会转换为 `file://` 链接。

页面加载时自动检查并连接 WebSocket；连接成功不显示弹窗，连接失败才展示启动与重试指引。

## 许可证

本项目采用 [MIT License](./LICENSE)。

## English

Codex CLI lightweight Web UI with no npm dependency. It uses Vue 3 from a CDN and calls the Codex App Server JSON-RPC API over WebSocket.

The frontend is split by responsibility into `index.html`, `style.css`, and `app.js`.

### Run

Run the startup script:

```sh
./start.sh
```

By default, the script starts `codex app-server --listen ws://127.0.0.1:4500`, waits for the App Server to become ready, and serves the UI with Python at `http://127.0.0.1:8080`.

To use a compatible Codex fork, you can edit the default `CODEX_CMD` value at the top of `start.sh`. 

If port 4500 is already listening, the script reuses the existing process. Press `Ctrl-C` to stop the Python server and any App Server process started by this script.

The browser connects to `ws://127.0.0.1:8080/app-server`; the Python service proxies the connection to the App Server to avoid the browser `Origin` restriction.

### Features

- Loads real conversations with `thread/list`.
- Reads conversation history with `thread/read`.
- Creates conversations with `thread/start`, including an optional `cwd`.
- Sets conversation names with `thread/name/set`.
- Sends messages with `turn/start` and streams responses.
- Loads models with `model/list` and supports model and reasoning effort selection.
- Stops active responses with `turn/interrupt`.
- Archives conversations with `thread/archive`.
- Resumes historical conversations only when sending a new message.
- Renders `agentMessage.phase === "commentary"` as thinking and `final_answer` as the final answer.
- Includes dependency-free basic Markdown rendering for headings, paragraphs, quotes, lists, links, emphasis, code blocks, and tables.
- Converts local paths to `file://` links.

The page checks the WebSocket connection on load. It stays quiet when connected and only shows setup/retry guidance when the connection fails.

## License

Licensed under the [MIT License](./LICENSE).
