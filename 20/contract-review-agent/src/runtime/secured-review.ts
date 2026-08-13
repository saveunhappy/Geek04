import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { promises as fs } from "node:fs";
import "dotenv/config";
import { reviewWithSkill } from "../review/skill-chunked-review.js";
import securityGuardExtension from "../extensions/security-guard.js";
import { runSecurityGuards } from "../guard/guards.js";

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
  const filePath = process.argv[2] ?? "sample-contract.txt";
  const text = await fs.readFile(filePath, "utf-8");

  console.log(`开始审查 ${filePath}，共 ${text.length} 字符...\n`);

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model: minimaxiModel,
    thinkingLevel: "medium",
    extensions: [securityGuardExtension],
  });

  session.subscribe(async (event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }

    if (event.type === "tool_execution_start") {
      const guardResult = await runSecurityGuards(
        { toolName: event.toolName, toolCallId: event.toolCallId, input: event.args },
        { cwd: process.cwd(), ui: undefined } as any,
      );
      if (guardResult?.block) {
        console.log(`\n[护栏阻断] ${event.toolName}: ${guardResult.reason}`);
      } else {
        console.log(`\n[Tool Start] ${event.toolName}`);
      }
    }

    if (event.type === "turn_end") {
      const msg = event.message as any;
      if (msg.errorMessage) console.error(`\n[错误] ${msg.errorMessage}`);
    }
  });

  const result = await reviewWithSkill(session, text);

  console.log("\n\n=== 审查结果 ===");
  console.log(`总体评分: ${result.score}`);
  console.log(`风险概览: ${result.summary}`);
  console.log(`风险总数: ${result.risks.length}`);
}

main().catch((err) => {
  console.error("[运行错误]", err);
  process.exit(1);
});