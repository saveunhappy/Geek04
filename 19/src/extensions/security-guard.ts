import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runSecurityGuards } from "../guard/guards.js";
import { logToolCall } from "../guard/audit-logger.js";

export default function securityGuardExtension(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    await logToolCall({
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      input: event.input,
    });
    return await runSecurityGuards(event, ctx);
  });
}