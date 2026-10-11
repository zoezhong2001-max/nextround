import { resolve } from "node:path";
import { CodexBridge } from "../server/agent.mjs";
const bridge = new CodexBridge({
  directory: resolve(".local-data"),
  mode: "codex",
});
try {
  const account = await bridge.account();
  const models = await bridge.models();
  console.log(
    JSON.stringify(
      {
        accountType: account.type,
        plan: account.plan,
        models: models
          .map((m) => ({ id: m.id, isDefault: m.isDefault }))
          .slice(0, 8),
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--inference")) {
    const result = await bridge.run({
      instructions: "只回答一句中文。不运行工具。",
      prompt: "连接验证：回复“面试工作台已连接”。",
      timeoutMs: 60000,
    });
    console.log(
      JSON.stringify(
        { completed: true, model: result.model, text: result.text },
        null,
        2,
      ),
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  bridge.stop();
}
