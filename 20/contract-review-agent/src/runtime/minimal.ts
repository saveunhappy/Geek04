import { createAgentSession } from "@earendil-works/pi-coding-agent";
import "dotenv/config";

async function main() {
  const { session } = await createAgentSession({
    cwd: process.cwd(),
  });

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }

    if (event.type === "turn_end") {
      const msg = event.message as any;
      if (msg.errorMessage) {
        console.error(`\n[Error] ${msg.stopReason}: ${msg.errorMessage}`);
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

main().catch(console.error);
