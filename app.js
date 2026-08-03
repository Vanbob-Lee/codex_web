function agentMessageKind(item) {
  return item.phase === "commentary" ? "thinking" : "assistant";
}

function contentText(content) {
  return (content || []).map((part) => part.text || "").filter(Boolean).join("\n");
}

function threadTitle(thread) {
  return thread.name || thread.preview || "未命名会话";
}

function threadCwd(thread) {
  return thread.cwd || thread.gitInfo?.root || "";
}

function messagesFromThread(thread) {
  const messages = [];
  (thread?.turns || []).forEach((turn) => {
    (turn.items || []).forEach((item) => {
      if (item.type === "userMessage") messages.push({ id: item.id, kind: "user", text: contentText(item.content) });
      if (item.type === "agentMessage") {
        const kind = agentMessageKind(item);
        messages.push({ id: item.id, kind, text: item.text || "", completed: kind === "thinking", expanded: false });
      }
    });
  });
  return messages.filter((message) => message.text);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

function isSafeMarkdownHref(url) {
  return /^(https?:\/\/|file:\/\/|~\/|\/|\.{1,2}\/)/.test(url);
}

function localFileHref(url) {
  if (url.startsWith("file://")) return url;
  if (url.startsWith("~/")) return `file://${encodeURI(url)}`;
  if (url.startsWith("/")) return `file://${encodeURI(url)}`;
  return url;
}

function markdownTableCells(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)]\(\s*(?:&lt;\s*(.+?)\s*&gt;|([^)\n]+?))\s*\)/g, (_, label, bracketedUrl, plainUrl) => {
    const url = (bracketedUrl || plainUrl).trim();
    if (!isSafeMarkdownHref(url)) return label;
    const href = localFileHref(url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeTokens[Number(index)]);
}

function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let quote = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(`<blockquote>${renderInlineMarkdown(quote.join("\n")).replace(/\n/g, "<br>")}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("");
    blocks.push(`<${list.type}>${items}</${list.type}>`);
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tableDivider = lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/);
    if (tableDivider && line.includes("|")) {
      flushAll();
      const headers = markdownTableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(markdownTableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      const headerHtml = headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
      const rowsHtml = rows.map((row) => {
        const cells = headers.map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] || "")}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      blocks.push(`<div class="markdown-table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`);
      continue;
    }

    const fence = line.match(/^\s*```([a-zA-Z0-9_-]*)\s*$/);
    if (fence) {
      flushAll();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      const language = fence[1] ? ` class="language-${fence[1]}"` : "";
      blocks.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quoted = line.match(/^>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    flushList();

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushAll();
  return blocks.join("") || "<p></p>";
}

const app = Vue.createApp({
  data() {
    return {
      socket: null,
      requestId: 0,
      pendingRequests: new Map(),
      serverUrl: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/app-server`,
      serverReady: false,
      connectionError: "",
      conversationError: "",
      threads: [],
      activeId: null,
      activeThread: null,
      loadedThreadId: null,
      loadingThread: false,
      messages: [],
      draftMessage: "",
      models: [],
      selectedModel: "",
      efforts: [],
      selectedEffort: "",
      sending: false,
      activeTurnId: null,
      showCreate: false,
      showSetup: false,
      copied: false,
      draft: { title: "", workdir: "" }
    };
  },
  mounted() {
    this.connect();
  },
  methods: {
    connect() {
      if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) return;

      this.connectionError = "";
      const socket = new WebSocket(this.serverUrl);
      this.socket = socket;
      socket.addEventListener("open", () => this.initialize());
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("error", () => {
        if (this.socket !== socket) return;
        this.connectionError = `无法连接 ${this.serverUrl}。请确认 Web 服务和 App Server 正在运行。`;
        this.showSetup = true;
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.serverReady = false;
        this.sending = false;
        this.rejectPendingRequests(new Error("与 App Server 的连接已关闭。"));
        if (!this.connectionError) this.connectionError = "与 App Server 的连接已关闭。";
        this.showSetup = true;
      });
    },
    async initialize() {
      try {
        await this.request("initialize", {
          clientInfo: { name: "codex_web", title: "Codex Workspace", version: "0.1.0" }
        });
        this.notify("initialized", {});
        this.serverReady = true;
        this.showSetup = false;
        await this.loadThreads();
        await this.loadModels();
      } catch (error) {
        this.connectionError = error.message;
        this.showSetup = true;
      }
    },
    request(method, params = {}) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("App Server 未连接。"));
      }

      const id = ++this.requestId;
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        this.socket.send(JSON.stringify({ method, id, params }));
      });
    },
    notify(method, params = {}) {
      this.socket.send(JSON.stringify({ method, params }));
    },
    rejectPendingRequests(error) {
      this.pendingRequests.forEach(({ reject }) => reject(error));
      this.pendingRequests.clear();
    },
    handleMessage(event) {
      const message = JSON.parse(event.data);
      if (Object.prototype.hasOwnProperty.call(message, "id") && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || "App Server 请求失败。"));
        else pending.resolve(message.result);
        return;
      }

      const params = message.params || {};
      if (["thread/archived", "thread/unarchived", "thread/deleted"].includes(message.method)) {
        this.loadThreads();
        return;
      }
      if (message.method === "turn/completed") {
        if (!this.activeTurnId || params.turn?.id === this.activeTurnId) {
          this.sending = false;
          this.activeTurnId = null;
          this.completeThinking();
          this.loadThreads();
        }
        return;
      }
      if (params.threadId && params.threadId !== this.activeId) return;

      if (message.method === "item/started") this.handleItemStarted(params.item);
      if (message.method === "item/completed") this.handleItemCompleted(params.item);
      if (message.method === "item/agentMessage/delta") this.appendAgentDelta(params);
    },
    async loadThreads() {
      try {
        const result = await this.request("thread/list", { limit: 100, sortKey: "recency_at", sortDirection: "desc" });
        this.threads = result.data || [];
      } catch (error) {
        this.connectionError = error.message;
      }
    },
    async loadModels() {
      try {
        const result = await this.request("model/list", { limit: 100, includeHidden: false });
        this.models = result.data || [];
        const defaultModel = this.models.find((model) => model.isDefault) || this.models[0];
        if (!this.selectedModel && defaultModel) this.selectedModel = defaultModel.id;
        this.updateEfforts();
      } catch (error) {
        this.connectionError = error.message;
      }
    },
    updateEfforts() {
      const model = this.models.find((item) => item.id === this.selectedModel);
      const supported = model?.supportedReasoningEfforts || [];
      this.efforts = supported.map((item) => ({
        value: item.reasoningEffort,
        label: item.reasoningEffort
      }));
      if (!this.efforts.some((item) => item.value === this.selectedEffort)) {
        this.selectedEffort = model?.defaultReasoningEffort || this.efforts[0]?.value || "";
      }
    },
    async selectThread(threadId) {
      this.activeId = threadId;
      this.activeThread = this.threads.find((thread) => thread.id === threadId) || null;
      this.loadedThreadId = null;
      this.loadingThread = true;
      this.conversationError = "";
      this.messages = [];
      this.sending = false;
      this.activeTurnId = null;
      try {
        const result = await this.request("thread/read", { threadId, includeTurns: true });
        if (this.activeId !== threadId) return;
        this.activeThread = result.thread;
        this.messages = messagesFromThread(this.activeThread);
        this.scrollToBottom();
      } catch (error) {
        if (this.activeId === threadId) this.conversationError = error.message;
      } finally {
        if (this.activeId === threadId) this.loadingThread = false;
      }
    },
    async createSession() {
      try {
        const params = this.draft.workdir ? { cwd: this.draft.workdir } : {};
        const result = await this.request("thread/start", params);
        const thread = result.thread;
        if (this.draft.title) {
          await this.request("thread/name/set", { threadId: thread.id, name: this.draft.title });
          thread.name = this.draft.title;
        }
        this.showCreate = false;
        this.activeId = thread.id;
        this.activeThread = thread;
        this.loadedThreadId = thread.id;
        this.messages = [];
        this.conversationError = "";
        await this.loadThreads();
      } catch (error) {
        this.conversationError = error.message;
      }
    },
    openCreateDialog() {
      if (!this.serverReady) {
        this.showSetup = true;
        return;
      }
      this.draft = { title: "", workdir: "" };
      this.showCreate = true;
    },
    async sendMessage() {
      const text = this.draftMessage.trim();
      if (!text || !this.activeId || this.sending) return;

      this.conversationError = "";
      try {
        if (this.loadedThreadId !== this.activeId) {
          await this.request("thread/resume", { threadId: this.activeId });
          this.loadedThreadId = this.activeId;
        }
        this.messages.push({ id: `local-user-${Date.now()}`, kind: "user", text });
        this.draftMessage = "";
        this.sending = true;
        this.scrollToBottom();
        const result = await this.request("turn/start", {
          threadId: this.activeId,
          input: [{ type: "text", text }],
          ...(this.selectedModel ? { model: this.selectedModel } : {}),
          ...(this.selectedEffort ? { effort: this.selectedEffort } : {})
        });
        this.activeTurnId = result.turn?.id || null;
        this.loadThreads();
      } catch (error) {
        this.sending = false;
        this.conversationError = error.message;
      }
    },
    async stopTurn() {
      if (!this.activeId || !this.activeTurnId) return;
      try {
        await this.request("turn/interrupt", {
          threadId: this.activeId,
          turnId: this.activeTurnId
        });
      } catch (error) {
        this.conversationError = error.message;
      }
    },
    async archiveThread(threadId) {
      try {
        await this.request("thread/archive", { threadId });
        if (this.activeId === threadId) {
          this.activeId = null;
          this.activeThread = null;
          this.messages = [];
          this.loadedThreadId = null;
          this.activeTurnId = null;
          this.sending = false;
        }
        await this.loadThreads();
      } catch (error) {
        this.connectionError = error.message;
      }
    },
    handleItemStarted(item) {
      if (!item || this.messages.some((message) => message.id === item.id)) return;
      if (item.type === "agentMessage") {
        const kind = agentMessageKind(item);
        this.messages.push({ id: item.id, kind, text: item.text || "", completed: false, expanded: kind === "thinking" });
      }
    },
    handleItemCompleted(item) {
      if (!item) return;
      if (item.type === "agentMessage") {
        let message = this.messages.find((entry) => entry.id === item.id);
        const kind = message?.kind === "thinking" || agentMessageKind(item) === "thinking" ? "thinking" : "assistant";
        if (!message) {
          message = { id: item.id, kind, text: "", completed: false, expanded: kind === "thinking" };
          this.messages.push(message);
        }
        message.kind = kind;
        message.text = item.text || message.text;
        if (kind === "thinking") {
          message.completed = true;
          message.expanded = false;
        } else {
          this.completeThinking();
        }
        this.scrollToBottom();
      }
    },
    appendAgentDelta(params) {
      const id = params.itemId || "streaming-agent-message";
      let message = this.messages.find((entry) => entry.id === id);
      if (!message) {
        const kind = params.phase === "commentary" ? "thinking" : "assistant";
        message = { id, kind, text: "", completed: false, expanded: kind === "thinking" };
        this.messages.push(message);
      }
      message.text += params.delta || "";
      if (message.kind === "thinking") message.expanded = true;
      else this.completeThinking();
      this.scrollToBottom();
    },
    completeThinking() {
      this.messages.filter((message) => message.kind === "thinking" && !message.completed).forEach((message) => {
        message.completed = true;
        message.expanded = false;
      });
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const element = this.$refs.messageList;
        if (element) element.scrollTop = element.scrollHeight;
      });
    },
    async copyCommand() {
      try {
        await navigator.clipboard.writeText("./start.sh");
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1500);
      } catch (_) {
        this.copied = false;
      }
    }
  },
  beforeUnmount() {
    if (this.socket) this.socket.close();
  }
});

Object.assign(app.config.globalProperties, {
  renderMarkdown,
  threadTitle,
  threadCwd
});

app.mount("#app");
