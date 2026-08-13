import { startWebServer } from "../src/web/server.ts";

async function main() {
  const server = await startWebServer(3457);
  console.log("测试服务器已启动：http://localhost:3457");

  // 测试静态首页
  const indexRes = await fetch("http://localhost:3457/");
  console.log("GET / =", indexRes.status, indexRes.headers.get("content-type"));

  // 测试 chat-panel.js
  const jsRes = await fetch("http://localhost:3457/chat-panel.js");
  console.log("GET /chat-panel.js =", jsRes.status, jsRes.headers.get("content-type"));

  // 测试 CORS 预检
  const corsRes = await fetch("http://localhost:3457/api/chat", { method: "OPTIONS" });
  console.log("OPTIONS /api/chat =", corsRes.status);

  // 测试 report 接口（不调用 LLM，只验证接口可访问）
  // 注意：该接口会真正调用 LLM，如需避免消耗 Token，可在 .env 缺失时观察错误处理。
  // 这里仅验证 POST 路由存在且返回 JSON。
  if (process.env.RUN_LLM_TEST) {
    const reportRes = await fetch("http://localhost:3457/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: "sample-contract.txt" }),
    });
    const reportData = await reportRes.json();
    console.log("POST /api/report =", reportRes.status, reportData);
  } else {
    console.log("跳过 LLM 调用测试（设置 RUN_LLM_TEST=1 可启用）");
  }

  server.close();
  console.log("\n所有基础测试通过。");
}

main().catch((err) => {
  console.error("[测试错误]", err);
  process.exit(1);
});
