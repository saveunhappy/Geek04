import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { detectByRegex } from "./pii-detector.js";

export interface ToolCallEventLike {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export type GuardResult =
  | { action: "pass" }
  | { action: "block"; reason: string }
  | { action: "rewrite"; input: Record<string, unknown> };

export type GuardRule = (event: ToolCallEventLike, ctx: ExtensionContext) => Promise<GuardResult>;

const DANGEROUS_BASH_PATTERNS = [
  /rm\s+-rf\s+\//,
  /curl.*\|.*sh/,
  /sudo\s/,
  /mkfs/,
  /dd\s+if=/,
];

export const dangerousCommandGuard: GuardRule = async (event) => {
  if (event.toolName !== "bash") return { action: "pass" };

  const cmd = String((event.input as any).command ?? "");
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(cmd)) {
      return { action: "block", reason: `检测到危险命令: ${pattern}` };
    }
  }
  return { action: "pass" };
};

const WEB_FETCH_WHITELIST = [
  "gov.cn",
  "court.gov.cn",
  "gsxt.gov.cn",
  "tianyancha.com",
  "qcc.com",
];

export const webFetchWhitelistGuard: GuardRule = async (event) => {
  if (event.toolName !== "web_fetch" && event.toolName !== "web_search") {
    return { action: "pass" };
  }

  const url = String((event.input as any).url ?? "");
  try {
    const hostname = new URL(url).hostname;
    const allowed = WEB_FETCH_WHITELIST.some((d) => hostname.endsWith(d));
    if (!allowed) {
      return { action: "block", reason: `域名 ${hostname} 不在白名单` };
    }
  } catch {
    return { action: "block", reason: "URL 格式无效" };
  }

  return { action: "pass" };
};

export const sensitiveContentGuard: GuardRule = async (event, ctx) => {
  const inputText = JSON.stringify(event.input);
  const hits = detectByRegex(inputText);
  if (hits.length === 0) return { action: "pass" };

  ctx.ui?.notify(`正则命中敏感信息: ${hits.join("; ")}`, "warning");
  return { action: "block", reason: `检测到敏感信息: ${hits.join("; ")}` };
};

const FORBIDDEN_PATHS = [".ssh", ".env", ".aws/credentials", ".git/config"];

export const fileAccessGuard: GuardRule = async (event, ctx) => {
  if (event.toolName !== "read") return { action: "pass" };

  const filePath = String((event.input as any).filePath ?? "");
  if (!filePath) return { action: "pass" };

  const absolute = path.resolve(ctx.cwd, filePath);

  if (FORBIDDEN_PATHS.some((p) => absolute.includes(p))) {
    return { action: "block", reason: "禁止访问敏感文件" };
  }

  if (!absolute.startsWith(ctx.cwd)) {
    return { action: "block", reason: "禁止访问项目目录外的文件" };
  }

  return { action: "pass" };
};

export const ALL_GUARDS: GuardRule[] = [
  dangerousCommandGuard,
  webFetchWhitelistGuard,
  sensitiveContentGuard,
  fileAccessGuard,
];

export async function runSecurityGuards(event: ToolCallEventLike, ctx: ExtensionContext) {
  for (const guard of ALL_GUARDS) {
    const result = await guard(event, ctx);
    if (result.action === "block") {
      return { block: true, reason: result.reason };
    }
  }
  return undefined;
}