class ChatPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.messages = [];
    this.currentStreamingMessage = null;
    this.pendingFile = null;
    this.pendingMessage = "";
    this.lastFilePath = "sample-contract.txt";
    this.apiBase = this.getAttribute("api-base") || "";
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${this.apiBase}/chat-panel.css">
      <div class="header">
        <span>合同审查助手</span>
        <button id="report-btn" disabled>生成报告</button>
      </div>
      <div class="messages"></div>
      <div class="input-area">
        <label class="file-label" for="file-input">选择合同</label>
        <input type="file" id="file-input" accept=".txt,.docx,.pdf">
        <input type="text" id="message-input" placeholder="输入消息，例如：请审查这份合同">
        <button id="send-btn">发送</button>
      </div>
      <div class="overlay" id="permission-overlay" style="display:none">
        <div class="dialog">
          <h3>权限预检</h3>
          <p>Agent 即将调用 parse_contract、classify_contract、write 等工具来审查合同，并可能将结果写入本地 reports 目录。是否继续？</p>
          <div class="dialog-actions">
            <button id="deny-btn">拒绝</button>
            <button id="allow-btn" class="primary">允许</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const sendBtn = this.shadowRoot.getElementById("send-btn");
    const input = this.shadowRoot.getElementById("message-input");
    const fileInput = this.shadowRoot.getElementById("file-input");
    const allowBtn = this.shadowRoot.getElementById("allow-btn");
    const denyBtn = this.shadowRoot.getElementById("deny-btn");
    const reportBtn = this.shadowRoot.getElementById("report-btn");

    sendBtn.addEventListener("click", () => this.onSend());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.onSend();
    });
    fileInput.addEventListener("change", (e) => this.onFileSelected(e));
    allowBtn.addEventListener("click", () => this.onPermission(true));
    denyBtn.addEventListener("click", () => this.onPermission(false));
    reportBtn.addEventListener("click", () => this.onGenerateReport());
  }

  onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.pendingFile = file;
    this.addMessage("user", `已选择文件：${file.name}`);
    const input = this.shadowRoot.getElementById("message-input");
    if (!input.value.trim()) input.value = "请审查这份合同";
  }

  onSend() {
    const input = this.shadowRoot.getElementById("message-input");
    const message = input.value.trim();
    if (!message) return;

    input.value = "";
    this.addMessage("user", message);
    this.showPermissionDialog(message);
  }

  showPermissionDialog(message) {
    this.pendingMessage = message;
    this.shadowRoot.getElementById("permission-overlay").style.display = "flex";
  }

  onPermission(allowed) {
    this.shadowRoot.getElementById("permission-overlay").style.display = "none";
    if (!allowed) {
      this.addMessage("assistant", "已取消操作。");
      return;
    }
    this.startChat(this.pendingMessage);
  }

  async startChat(message) {
    this.setBusy(true);
    this.currentStreamingMessage = this.addMessage("assistant", "");

    this.lastFilePath = "sample-contract.txt";
    if (this.pendingFile) {
      this.lastFilePath = await this.uploadFile(this.pendingFile);
    }

    const res = await fetch(`${this.apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, filePath: this.lastFilePath }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const packets = buffer.split("\n\n");
      buffer = packets.pop() ?? "";
      for (const packet of packets) {
        const lines = packet.split("\n");
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine.slice(5).trim());
          this.handleSSEPacket(parsed);
        } catch {}
      }
    }

    this.setBusy(false);
    this.shadowRoot.getElementById("report-btn").disabled = false;
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${this.apiBase}/api/upload`, { method: "POST", body: formData });
    const data = await res.json();
    return data.filePath;
  }

  handleSSEPacket(packet) {
    const { event, data } = packet;
    if (event === "message_delta") {
      this.appendToCurrentMessage(data.delta);
    } else if (event === "tool_start") {
      this.addMessage("tool", `[Tool Start] ${data.toolName}`);
    } else if (event === "tool_end") {
      this.addMessage("tool", `[Tool End] ${data.toolName} ${data.isError ? "failed" : "ok"}`);
    } else if (event === "status") {
      this.addMessage("status", data.text);
    } else if (event === "report") {
      this.appendReportSummary(data);
      if (data.reportPath) {
        this.dispatchEvent(new CustomEvent("artifact-ready", {
          detail: { reportPath: data.reportPath },
          bubbles: true,
          composed: true,
        }));
        this.addMessage("status", `报告已加载到右侧沙盒：${data.reportPath}`);
      }
    } else if (event === "error") {
      this.appendToCurrentMessage(`\n[错误] ${data.message}`);
    } else if (event === "done") {
      this.currentStreamingMessage = null;
    }
  }

  addMessage(role, text) {
    const container = this.shadowRoot.querySelector(".messages");
    const el = document.createElement("div");
    el.className = `message ${role}`;
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    this.messages.push({ role, text });
    return el;
  }

  appendToCurrentMessage(delta) {
    if (!this.currentStreamingMessage) {
      this.currentStreamingMessage = this.addMessage("assistant", "");
    }
    this.currentStreamingMessage.textContent += delta;
    const container = this.shadowRoot.querySelector(".messages");
    container.scrollTop = container.scrollHeight;
  }

  appendReportSummary(data) {
    const summary = `审查完成：总体评分 ${data.score}，${data.summary}，共 ${data.riskCount} 条风险。`;
    this.addMessage("assistant", summary);
  }

  async onGenerateReport() {
    this.addMessage("status", "正在生成 HTML 报告...");
    const res = await fetch(`${this.apiBase}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: this.lastFilePath || "sample-contract.txt" }),
    });
    const data = await res.json();
    if (data.success) {
      this.addMessage("assistant", `报告已生成：${data.reportPath}`);
      this.dispatchEvent(new CustomEvent("artifact-ready", { detail: { reportPath: data.reportPath }, bubbles: true, composed: true }));
    } else {
      this.addMessage("assistant", `报告生成失败：${data.error}`);
    }
  }

  setBusy(busy) {
    this.shadowRoot.getElementById("send-btn").disabled = busy;
    this.shadowRoot.getElementById("message-input").disabled = busy;
  }
}

customElements.define("chat-panel", ChatPanel);
