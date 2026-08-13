import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import "dotenv/config";

/**
 * 使用 MiniMax OpenAI 兼容端点显式指定模型。
 * 需要环境变量 OPENAI_API_KEY=你的MiniMax密钥
 */
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
  console.log("当前环境变量 OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "已设置" : "未设置");

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: process.cwd(),
    model: minimaxiModel,
    thinkingLevel: "medium",
  });

  console.log("当前模型:", session.model ? `${session.model.provider}/${session.model.id}` : "undefined");
  if (modelFallbackMessage) console.log("模型回退提示:", modelFallbackMessage);

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
    "请审查当前目录下的 sample-contract.txt，识别其中的不平等条款、违约责任失衡和知识产权陷阱。"
  );
}

main().catch((err) => {
  console.error("[运行错误]", err);
  process.exit(1);
});
