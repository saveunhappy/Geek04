import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import "dotenv/config";
import { parseContractTool, parseContractFile } from "../tools/contract-parser.js";
import { classifyContractTool } from "../tools/risk-classifier.js";
import { reviewWithSkill } from "../review/skill-chunked-review.js";
import { logToolCall } from "../guard/audit-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "static");

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

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  let url = req.url ?? "/";

  if (url.startsWith("/reports/")) {
    await serveFile(res, path.join(process.cwd(), decodeURIComponent(url.slice(1))));
    return;
  }
  if (url.startsWith("/uploads/")) {
    await serveFile(res, path.join(process.cwd(), decodeURIComponent(url.slice(1))));
    return;
  }

  if (url === "/") url = "/index.html";
  const filePath = path.join(STATIC_DIR, path.normalize(url));
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  await serveFile(res, filePath);
}

async function serveFile(res: ServerResponse, filePath: string) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    res.writeHead(200, { "Content-Type": contentType[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendSSE(res: ServerResponse, event: string, data: unknown) {
  res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
}

async function handleUpload(req: IncomingMessage, res: ServerResponse) {
  setCors(res);
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400).end(JSON.stringify({ error: "Expected multipart/form-data" }));
    return;
  }

  const boundary = contentType.split("boundary=")[1];
  if (!boundary) {
    res.writeHead(400).end(JSON.stringify({ error: "Missing boundary" }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const text = buffer.toString("binary");

  const filenameMatch = text.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? filenameMatch[1] : `upload-${Date.now()}.txt`;
  const headerEnd = text.indexOf("\r\n\r\n");
  const footerStart = text.lastIndexOf(`\r\n--${boundary}`);
  if (headerEnd === -1 || footerStart === -1) {
    res.writeHead(400).end(JSON.stringify({ error: "Malformed multipart body" }));
    return;
  }
  const fileData = buffer.slice(headerEnd + 4, footerStart);

  const uploadsDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, fileData);

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ filePath: path.relative(process.cwd(), filePath) }));
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  setCors(res);
  const body = (await readBody(req)) as { message?: string; filePath?: string };
  const message = body.message ?? "审查当前合同文件";
  const filePath = body.filePath ?? "sample-contract.txt";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let sessionClosed = false;
  req.on("close", () => {
    sessionClosed = true;
  });

  try {
    const { session } = await createAgentSession({
      cwd: process.cwd(),
      model: minimaxiModel,
      thinkingLevel: "medium",
      customTools: [parseContractTool, classifyContractTool],
      tools: ["read", "write", "parse_contract", "classify_contract"],
    });

    session.subscribe(async (event) => {
      if (sessionClosed) return;

      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        sendSSE(res, "message_delta", { delta: event.assistantMessageEvent.delta });
      }

      if (event.type === "tool_execution_start") {
        await logToolCall({
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: event.args,
        });
        sendSSE(res, "tool_start", { toolName: event.toolName, toolCallId: event.toolCallId });
      }

      if (event.type === "tool_execution_end") {
        sendSSE(res, "tool_end", { toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError });
      }

      if (event.type === "turn_end") {
        const msg = event.message as any;
        if (msg.errorMessage) {
          sendSSE(res, "error", { message: msg.errorMessage });
        }
      }
    });

    const { text, charCount } = await parseContractFile(filePath);
    sendSSE(res, "status", { text: `正在审查 ${filePath}，格式 ${path.extname(filePath)}，共 ${charCount} 字符...` });

    const result = await reviewWithSkill(session, text);

    const reportHtml = buildReportHtml(filePath, result.score, result.summary, result.risks);
    const reportPath = path.join(process.cwd(), "reports", `report-${Date.now()}.html`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, reportHtml, "utf-8");

    sendSSE(res, "report", {
      score: result.score,
      summary: result.summary,
      riskCount: result.risks.length,
      risks: result.risks,
      reportPath: path.basename(reportPath),
    });

    sendSSE(res, "done", {});
  } catch (err: any) {
    sendSSE(res, "error", { message: err.message ?? String(err) });
    sendSSE(res, "done", {});
  }

  res.end();
}

async function handleGenerateReport(req: IncomingMessage, res: ServerResponse) {
  setCors(res);
  const body = (await readBody(req)) as { filePath?: string };
  const filePath = body.filePath ?? "sample-contract.txt";

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });

  try {
    const { session } = await createAgentSession({
      cwd: process.cwd(),
      model: minimaxiModel,
      thinkingLevel: "medium",
      customTools: [parseContractTool, classifyContractTool],
      tools: ["read", "write", "parse_contract", "classify_contract"],
    });

    const { text } = await parseContractFile(filePath);
    const result = await reviewWithSkill(session, text);

    const reportHtml = buildReportHtml(filePath, result.score, result.summary, result.risks);
    const reportPath = path.join(process.cwd(), "reports", `report-${Date.now()}.html`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, reportHtml, "utf-8");

    res.end(JSON.stringify({ success: true, reportPath: path.basename(reportPath) }));
  } catch (err: any) {
    res.end(JSON.stringify({ success: false, error: err.message ?? String(err) }));
  }
}

function buildReportHtml(
  filePath: string,
  score: string,
  summary: string,
  risks: { level: string; type: string; clause: string; originalText: string; suggestion: string }[],
) {
  const levelColor: Record<string, string> = { high: "#e53935", medium: "#fb8c00", low: "#fdd835" };
  const rows = risks
    .map(
      (r) => `
    <tr>
      <td style="color:${levelColor[r.level] ?? "#333"};font-weight:bold;">${r.level.toUpperCase()}</td>
      <td>${r.type}</td>
      <td>${r.clause}</td>
      <td>${r.originalText}</td>
      <td>${r.suggestion}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>合同审查报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 960px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { margin-top: 0; }
    .meta { color: #666; margin-bottom: 24px; }
    .score { font-size: 48px; font-weight: bold; color: ${score === "A" ? "#43a047" : score === "B" ? "#1e88e5" : score === "C" ? "#fb8c00" : "#e53935"}; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border: 1px solid #e0e0e0; padding: 12px; text-align: left; vertical-align: top; }
    th { background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>合同审查报告</h1>
    <div class="meta">文件：${path.basename(filePath)}</div>
    <div class="score">总体评分：${score}</div>
    <div class="meta">${summary}</div>
    <table>
      <thead>
        <tr><th>等级</th><th>类型</th><th>条款</th><th>原文</th><th>建议</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function startWebServer(port = 3456) {
  const server = createServer(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    try {
      if (req.url?.startsWith("/api/upload") && req.method === "POST") {
        await handleUpload(req, res);
        return;
      }
      if (req.url?.startsWith("/api/chat") && req.method === "POST") {
        await handleChat(req, res);
        return;
      }
      if (req.url?.startsWith("/api/report") && req.method === "POST") {
        await handleGenerateReport(req, res);
        return;
      }
      await serveStatic(req, res);
    } catch (err: any) {
      res.writeHead(500).end(err.message ?? String(err));
    }
  });

  await new Promise<void>((resolve) => server.listen(port, () => resolve()));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2]) || 3456;
  startWebServer(port).then(() => {
    console.log(`合同审查 ChatPanel 服务已启动：http://localhost:${port}`);
  });
}
