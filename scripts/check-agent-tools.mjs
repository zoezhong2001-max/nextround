import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CodexBridge } from "../server/agent.mjs";
const directory = mkdtempSync(join(tmpdir(), "nextround-tool-probe-"));
const bridge = new CodexBridge({ directory, mode: "codex" });
const receipt = "tool-receipt-" + randomUUID();
let called = false;
try {
  const result = await bridge.run({
    instructions:
      "这是一次只读工具联通测试。只调用 workbench_probe 一次，然后原样输出工具返回的 receipt。禁止使用其他工具。",
    prompt: "请通过 workbench_probe 获取回执。",
    dynamicTools: [
      {
        type: "function",
        name: "workbench_probe",
        description: "返回此次测试的真实回执",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    ],
    onToolCall: async (name) => {
      if (name !== "workbench_probe") throw new Error("未知工具");
      called = true;
      return { receipt };
    },
    timeoutMs: 90000,
  });
  if (!called || !result.text.includes(receipt))
    throw new Error("未验证真实工具往返");
  console.log(
    JSON.stringify({
      completed: true,
      toolRoundTrip: true,
      model: result.model,
    }),
  );
} finally {
  bridge.stop();
}
