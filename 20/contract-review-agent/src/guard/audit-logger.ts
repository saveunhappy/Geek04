import { promises as fs } from "node:fs";

export async function logToolCall(event: { toolName: string; toolCallId: string; input: unknown }) {
  const entry = {
    timestamp: new Date().toISOString(),
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    args: event.input,
  };
  await fs.appendFile("audit.log", JSON.stringify(entry) + "\n");
}