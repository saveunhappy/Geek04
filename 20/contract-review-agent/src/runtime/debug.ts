import { createAgentSession } from "@earendil-works/pi-coding-agent";
import "dotenv/config";

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
  console.log("[1] 开始创建 session...");
  console.log("[1] 环境变量 OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "已设置" : "未设置");
  console.log("[1] 环境变量 MINIMAX_CN_API_KEY:", process.env.MINIMAX_CN_API_KEY ? "已设置" : "未设置");

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: process.cwd(),
    model: minimaxiModel,
    thinkingLevel: "medium",
  });

  console.log("[2] session 创建完成");
  console.log("[2] 当前模型:", session.model ? `${session.model.provider}/${session.model.id}` : "undefined");
  console.log("[2] modelFallbackMessage:", modelFallbackMessage ?? "无");

  session.subscribe((event) => {
    console.log("[EVENT]", event.type);

    if (event.type === "agent_start") {
      console.log("[3] Agent 开始运行");
    }

    if (event.type === "agent_end") {
      console.log("[3] Agent 运行结束，新消息数:", event.messages.length);
    }

    if (event.type === "turn_end") {
      console.log("[3] Turn 结束，assistant stopReason:", (event.message as any).stopReason);
      if ((event.message as any).errorMessage) {
        console.log("[3] Turn 错误:", (event.message as any).errorMessage);
      }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }

    if (event.type === "tool_execution_start") {
      console.log(`\n[Tool Start] ${event.toolName}`);
    }
  });

  console.log("[4] 发送 prompt...");
  await session.prompt(
    "请审查当前目录下的 sample-contract.txt，识别其中的不平等条款、违约责任失衡和知识产权陷阱。"
  );
  console.log("[5] prompt 完成");
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
