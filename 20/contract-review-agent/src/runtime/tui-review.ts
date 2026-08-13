import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { Container, ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { promises as fs } from "node:fs";
import path from "node:path";
import "dotenv/config";
import { parseContractTool, parseContractFile } from "../tools/contract-parser.js";
import { classifyContractTool } from "../tools/risk-classifier.js";
import { reviewWithSkill } from "../review/skill-chunked-review.js";
import { logToolCall } from "../guard/audit-logger.js";
import { FileSelector, Header, OutputLog, PromptInput, StatusBar } from "../tui/components.js";

const minimaxiModel = {
  id: "MiniMax-M3",
  name: "MiniMax-M3",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.minimaxi.com/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
} satisfies Model<"openai-responses">;

const RESET = "\x1b[0m";
const BLUE = "\x1b[34m";
const DIM = "\x1b[2m";

class ContractReviewTUI {
  private terminal: ProcessTerminal;
  private tui: TUI;
  private root = new Container();
  private outputLog = new OutputLog();
  private statusBar = new StatusBar();
  private promptInput: PromptInput;
  private header = new Header("合同审查助手 - 按 Ctrl+C 退出");
  private isRunning = false;
  private filePath?: string;

  constructor(initialFilePath?: string) {
    this.filePath = initialFilePath;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);
    this.promptInput = new PromptInput();

    this.tui.addChild(this.root);

    this.promptInput.onSubmit = (value) => this.onSubmit(value);
    this.promptInput.onCtrlC = () => this.shutdown();
  }

  async start() {
    if (this.filePath) {
      this.showChatUI();
      this.tui.start();
      return;
    }

    const files = await this.scanContractFiles();
    if (files.length === 0) {
      console.error("当前目录下没有找到 .txt/.docx/.pdf 合同文件。");
      process.exit(1);
    }

    if (files.length === 1) {
      this.filePath = files[0];
      this.showChatUI();
      this.tui.start();
      return;
    }

    this.showFileSelector(files);
    this.tui.start();
  }

  private async scanContractFiles(): Promise<string[]> {
    const entries = await fs.readdir(process.cwd());
    return entries
      .filter((f) => [".txt", ".docx", ".pdf"].includes(path.extname(f).toLowerCase()))
      .sort();
  }

  private showFileSelector(files: string[]) {
    this.root.clear();

    const selector = new FileSelector(files);
    selector.onSelect = (filePath) => {
      this.filePath = filePath;
      this.showChatUI();
    };
    selector.onCancel = () => this.shutdown();

    this.root.addChild(selector);
    this.tui.setFocus(selector.list);
    this.tui.requestRender();
  }

  private showChatUI() {
    this.root.clear();
    this.root.addChild(this.header);
    this.root.addChild(this.outputLog);
    this.root.addChild(this.statusBar);
    this.root.addChild(this.promptInput);

    this.outputLog.append(`${DIM}已加载合同文件：${this.filePath}${RESET}`);
    this.outputLog.append(`${DIM}输入消息，例如：请审查这份合同${RESET}`);
    this.outputLog.append("");

    this.tui.setFocus(this.promptInput);
    this.tui.requestRender();
  }

  private async onSubmit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || this.isRunning) return;

    this.promptInput.clear();
    this.outputLog.append(`${BLUE}You:${RESET} ${trimmed}`);
    this.tui.requestRender();

    this.isRunning = true;
    this.statusBar.setText("Agent 运行中...");
    this.tui.requestRender();

    try {
      await this.runAgent(trimmed);
    } catch (err: any) {
      this.outputLog.append(`[错误] ${err.message ?? String(err)}`);
    } finally {
      this.isRunning = false;
      this.statusBar.setText("就绪");
      this.tui.requestRender();
    }
  }

  private async runAgent(message: string) {
    if (!this.filePath) return;

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      model: minimaxiModel,
      thinkingLevel: "medium",
      customTools: [parseContractTool, classifyContractTool],
      tools: ["read", "write", "parse_contract", "classify_contract"],
    });

    let assistantStarted = false;

    session.subscribe(async (event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        if (!assistantStarted) {
          this.outputLog.append(`${BLUE}Agent:${RESET} `);
          assistantStarted = true;
        }
        this.outputLog.appendRaw(event.assistantMessageEvent.delta);
        this.tui.requestRender();
      }

      if (event.type === "message_end") {
        assistantStarted = false;
        this.outputLog.append("");
        this.tui.requestRender();
      }

      if (event.type === "tool_execution_start") {
        await logToolCall({
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: event.args,
        });
        this.outputLog.append(`${DIM}[Tool Start] ${event.toolName}${RESET}`);
        this.tui.requestRender();
      }

      if (event.type === "tool_execution_end") {
        this.outputLog.append(`${DIM}[Tool End] ${event.toolName} ${event.isError ? "failed" : "ok"}${RESET}`);
        this.tui.requestRender();
      }

      if (event.type === "turn_end") {
        const msg = event.message as any;
        if (msg.errorMessage) {
          this.outputLog.append(`[错误] ${msg.errorMessage}`);
          this.tui.requestRender();
        }
      }
    });

    const { text, charCount } = await parseContractFile(this.filePath);
    this.statusBar.setText(`正在审查 ${this.filePath}，共 ${charCount} 字符...`);
    this.tui.requestRender();

    const result = await reviewWithSkill(session, text);

    this.outputLog.append("");
    this.outputLog.append(`${BLUE}=== 审查结果 ===${RESET}`);
    this.outputLog.append(`总体评分：${result.score}`);
    this.outputLog.append(`风险概览：${result.summary}`);
    this.outputLog.append(`风险总数：${result.risks.length}`);
    this.tui.requestRender();
  }

  private shutdown() {
    this.tui.stop();
    process.exit(0);
  }
}

async function main() {
  const initialFilePath = process.argv[2];

  if (initialFilePath) {
    try {
      await fs.access(initialFilePath);
    } catch {
      console.error(`文件不存在：${initialFilePath}`);
      process.exit(1);
    }
  }

  const app = new ContractReviewTUI(initialFilePath);
  app.start();
}

main().catch((err) => {
  console.error("[运行错误]", err);
  process.exit(1);
});
