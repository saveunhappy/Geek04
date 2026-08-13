import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import "dotenv/config";
import { parseContractTool } from "../tools/contract-parser.js";
import { classifyContractTool } from "../tools/risk-classifier.js";

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

async function main() {
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model: minimaxiModel,
    customTools: [parseContractTool, classifyContractTool],
    tools: ["read", "parse_contract", "classify_contract"],
  });

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }

    if (event.type === "turn_end") {
      const msg = event.message as any;
      if (msg.errorMessage) {
        console.error(`\n[模型错误] ${msg.stopReason}: ${msg.errorMessage}`);
      }
    }

    if (event.type === "tool_execution_start") {
      console.log(`\n[Tool Start] ${event.toolName}`);
    }

    if (event.type === "tool_execution_end") {
      console.log(`[Tool End] ${event.toolName} ${event.isError ? "failed" : "ok"}`);
    }
  });

  await session.prompt(
    "请按以下步骤审查 sample-contract.docx\n" +
      "1. 使用 parse_contract 解析合同文件；\n" +
      "2. 使用 classify_contract 对合同进行分类；\n" +
      "3. 基于分类结果，识别该类型合同的高风险条款并给出修改建议。"
  );
}

main().catch((err) => {
  console.error("[运行错误]", err);
  process.exit(1);
});
