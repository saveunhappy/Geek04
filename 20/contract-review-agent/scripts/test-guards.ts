import {
  dangerousCommandGuard,
  webFetchWhitelistGuard,
  sensitiveContentGuard,
} from "../src/guard/guards.ts";

const ctx = { cwd: process.cwd(), ui: undefined } as any;

console.log("--- 危险命令测试 ---");
console.log("rm -rf /:", await dangerousCommandGuard({ toolName: "bash", toolCallId: "1", input: { command: "rm -rf /" } }, ctx));
console.log("ls -la:", await dangerousCommandGuard({ toolName: "bash", toolCallId: "2", input: { command: "ls -la" } }, ctx));

console.log("\n--- Web Fetch 白名单测试 ---");
console.log("evil.com:", await webFetchWhitelistGuard({ toolName: "web_fetch", toolCallId: "3", input: { url: "https://evil.com/steal" } }, ctx));
console.log("gsxt.gov.cn:", await webFetchWhitelistGuard({ toolName: "web_fetch", toolCallId: "4", input: { url: "https://gsxt.gov.cn/corp" } }, ctx));

console.log("\n--- 敏感信息测试 ---");
console.log("含手机号:", await sensitiveContentGuard({ toolName: "write", toolCallId: "5", input: { content: "联系人 13812345678" } }, ctx));
console.log("普通文本:", await sensitiveContentGuard({ toolName: "write", toolCallId: "6", input: { content: "今天天气真好" } }, ctx));