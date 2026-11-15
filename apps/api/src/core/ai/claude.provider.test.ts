import { deflateSync } from "node:zlib";
import type Anthropic from "@anthropic-ai/sdk";
import { planningExtractionSchema } from "@otd/contracts/planning";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAiProvider } from "./ai.provider.js";
import type { AiUsageRecord } from "./ai.types.js";
import { ClaudeAiProvider, echoable } from "./claude.provider.js";
import { FakeAiProvider } from "./fake.provider.js";
import { offlinePlanningExtract } from "./offline-planning.js";
import { extractPdfText } from "./pdf-text.js";

type Msg = { content: unknown[]; stop_reason: string; stop_details?: unknown; model: string; usage: Record<string, number | null> };

function stubClient(replies: (Msg | Error)[]) {
  const calls: Record<string, unknown>[] = [];
  const next = () => {
    const r = replies.shift();
    if (!r) throw new Error("no more replies");
    return r;
  };
  const client = {
    beta: {
      messages: {
        stream: (body: Record<string, unknown>) => {
          calls.push(structuredClone(body));
          const listeners: ((delta: string) => void)[] = [];
          const stream = {
            request_id: `req_${calls.length}`,
            on: (event: string, fn: (delta: string) => void) => {
              if (event === "text") listeners.push(fn);
              return stream;
            },
            finalMessage: async () => {
              const reply = next();
              if (reply instanceof Error) throw reply;
              for (const block of reply.content as { type: string; text?: string }[]) if (block.type === "text" && block.text) for (const fn of listeners) fn(block.text);
              return reply;
            },
          };
          return stream;
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

const usage = { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 };

function pdfWith(lines: string[]): Buffer {
  const ops = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 16} Td (${l.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`).join("\n");
  const stream = deflateSync(Buffer.from(ops, "latin1"));
  return Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj << /Length " + stream.length + " /Filter /FlateDecode >>\nstream\n", "latin1"), stream, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
}

describe("ClaudeAiProvider", () => {
  it("extracts with a json_schema output format, adaptive thinking, fallbacks and records usage", async () => {
    const schema = z.object({ styleNo: z.string().nullable(), confidence: z.number() });
    const { client, calls } = stubClient([{ content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"styleNo":"12593","confidence":0.95}' }], stop_reason: "end_turn", model: "claude-opus-5-5", usage }]);
    const recorded: AiUsageRecord[] = [];
    const ai = new ClaudeAiProvider(client, { model: "claude-opus-5-5" });
    ai.setUsageSink((u) => recorded.push(u));
    const out = await ai.extract({ purpose: "planning.extract", instructions: "抽取", schema, document: { filename: "a.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4") }, userId: "u1" });
    expect(out).toEqual({ styleNo: "12593", confidence: 0.95 });
    const body = calls[0]!;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    const fmt = (body.output_config as { format: { type: string; schema: { additionalProperties?: boolean; required?: string[] } } }).format;
    expect(fmt.type).toBe("json_schema");
    expect(fmt.schema.additionalProperties).toBe(false);
    expect(fmt.schema.required).toEqual(["styleNo", "confidence"]);
    const content = (body.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((c) => c.type)).toEqual(["document", "text"]);
    expect(body).not.toHaveProperty("temperature");
    expect(recorded).toEqual([{ purpose: "planning.extract", model: "claude-opus-5-5", userId: "u1", inputTokens: 105, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 0, stopReason: "end_turn", durationMs: expect.any(Number), requestId: "req_1" }]);
  });

  it("produces a strict-compatible schema for planning extraction", () => {
    const { client, calls } = stubClient([{ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", model: "m", usage }]);
    const ai = new ClaudeAiProvider(client, { model: "m" });
    void ai.extract({ purpose: "p", instructions: "i", schema: planningExtractionSchema }).catch(() => undefined);
    const schema = JSON.stringify((calls[0]!.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).not.toMatch(/"minimum"|"maximum"|"exclusiveMinimum"/);
  });

  it("fails on refusal and invalid output instead of returning garbage", async () => {
    const schema = z.object({ a: z.string() });
    const { client } = stubClient([
      { content: [], stop_reason: "refusal", stop_details: { explanation: "policy" }, model: "m", usage },
      { content: [{ type: "text", text: "not json" }], stop_reason: "end_turn", model: "m", usage },
    ]);
    const ai = new ClaudeAiProvider(client, { model: "m" });
    await expect(ai.extract({ purpose: "p", instructions: "i", schema })).rejects.toMatchObject({ reason: "refusal" });
    await expect(ai.extract({ purpose: "p", instructions: "i", schema })).rejects.toMatchObject({ reason: "invalid_output" });
  });

  it("runs the tool loop, returning all tool results in one user message", async () => {
    const { client, calls } = stubClient([
      {
        content: [
          { type: "text", text: "查一下" },
          { type: "tool_use", id: "t1", name: "lookup", input: { q: "PO0009631" } },
          { type: "tool_use", id: "t2", name: "broken", input: {} },
        ],
        stop_reason: "tool_use",
        model: "m",
        usage,
      },
      { content: [{ type: "text", text: "PO0009631 卡在验货" }], stop_reason: "end_turn", model: "m", usage },
    ]);
    const ai = new ClaudeAiProvider(client, { model: "m" });
    const res = await ai.chat({
      purpose: "assistant.chat",
      system: "sys",
      messages: [{ role: "user", content: "PO0009631 到哪了" }],
      tools: [
        { name: "lookup", description: "d", inputSchema: { type: "object", properties: { q: { type: "string" } } }, run: async (input) => ({ found: input.q }) },
        {
          name: "broken",
          description: "d",
          inputSchema: { type: "object", properties: {} },
          run: async () => {
            throw new Error("boom");
          },
        },
      ],
    });
    expect(res.text).toBe("PO0009631 卡在验货");
    expect(res.toolCalls.map((c) => c.name).sort()).toEqual(["broken", "lookup"]);
    const second = calls[1]!.messages as { role: string; content: { type: string; is_error?: boolean; tool_use_id?: string }[] }[];
    const last = second[second.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.content.map((c) => [c.tool_use_id, !!c.is_error])).toEqual([
      ["t1", false],
      ["t2", true],
    ]);
  });

  it("streams chat turns with prompt caching and eager tool input, forwarding text deltas", async () => {
    const { client, calls } = stubClient([
      { content: [{ type: "tool_use", id: "t1", name: "lookup", input: { q: "x" } }], stop_reason: "tool_use", model: "m", usage },
      { content: [{ type: "text", text: "好的" }], stop_reason: "end_turn", model: "m", usage },
    ]);
    const deltas: string[] = [];
    const ai = new ClaudeAiProvider(client, { model: "m" });
    const res = await ai.chat({
      purpose: "assistant.chat",
      system: "sys",
      messages: [{ role: "user", content: "q" }],
      tools: [{ name: "lookup", description: "d", inputSchema: { type: "object", properties: {} }, run: async () => "ok" }],
      onText: (d) => deltas.push(d),
    });
    expect(res.text).toBe("好的");
    expect(deltas).toEqual(["好的"]);
    expect(calls[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(calls[0]!.max_tokens).toBe(64000);
    expect((calls[0]!.tools as { eager_input_streaming?: boolean }[])[0]!.eager_input_streaming).toBe(true);
  });

  it("does not run tools from a turn cut off by max_tokens, and re-issues a turn whose tool input could not be parsed", async () => {
    let ran = 0;
    const tool = { name: "lookup", description: "d", inputSchema: { type: "object", properties: {} }, run: async () => ++ran };
    const truncated = stubClient([{ content: [{ type: "tool_use", id: "t1", name: "lookup", input: {} }], stop_reason: "max_tokens", model: "m", usage }]);
    const res = await new ClaudeAiProvider(truncated.client, { model: "m" }).chat({ purpose: "p", system: "s", messages: [{ role: "user", content: "q" }], tools: [tool] });
    expect(ran).toBe(0);
    expect(res.text).toContain("长度上限");
    const flaky = stubClient([new SyntaxError("Unexpected end of JSON input"), { content: [{ type: "text", text: "完成" }], stop_reason: "end_turn", model: "m", usage }]);
    const again = await new ClaudeAiProvider(flaky.client, { model: "m" }).chat({ purpose: "p", system: "s", messages: [{ role: "user", content: "q" }], tools: [tool] });
    expect(again.text).toBe("完成");
    expect(flaky.calls).toHaveLength(2);
  });

  it("routes offline chat handlers by purpose", async () => {
    const fake = new FakeAiProvider();
    fake.onChat("a", () => ({ text: "A", toolCalls: [] }));
    fake.onChat("b", () => ({ text: "B", toolCalls: [] }));
    const deltas: string[] = [];
    expect((await fake.chat({ purpose: "b", system: "", messages: [{ role: "user", content: "x" }], onText: (d) => deltas.push(d) })).text).toBe("B");
    expect((await fake.chat({ purpose: "a", system: "", messages: [{ role: "user", content: "x" }] })).text).toBe("A");
    expect(deltas).toEqual(["B"]);
  });

  it("drops thinking and tool_use blocks before a fallback boundary when echoing", () => {
    const blocks = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "tool_use", id: "x", name: "n", input: {} },
      { type: "text", text: "partial" },
      { type: "fallback", from: { model: "a" }, to: { model: "b" } },
      { type: "thinking", thinking: "", signature: "s2" },
      { type: "text", text: "rest" },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    expect(echoable(blocks).map((b) => b.type)).toEqual(["text", "fallback", "thinking", "text"]);
  });
});

describe("offline planning extractor", () => {
  it("is used when no API key is configured and reads the PDF text layer", async () => {
    const ai = createAiProvider({ AI_MODEL: "claude-opus-5-5" } as never);
    expect(ai).toBeInstanceOf(FakeAiProvider);
    const pdf = pdfWith(["Customer: NorthShore", "Style No: 12593", "Style Name: Tossed Floral Studio Gripper No Show", "Season: Fall 2027", "Women's No Show", "Needle Count: 144N", "Sizes: S / M / L", "Cuff: Hidden cuff", "Heel: Silicone grip dots"]);
    expect(extractPdfText(pdf)).toContain("Style No: 12593");
    const out = await ai.extract({ purpose: "planning.extract", instructions: "", schema: planningExtractionSchema, document: { filename: "brief.pdf", contentType: "application/pdf", data: pdf } });
    expect(out.fields.styleNo).toMatchObject({ value: "12593", confidence: 0.6 });
    expect(out.fields.seasonCode.value).toBe("FA27");
    expect(out.fields.category.value).toBe("WOMEN");
    expect(out.fields.subCategory.value).toBe("NO_SHOW");
    expect(out.fields.needleCount.value).toBe("144N");
    expect(out.fields.nameEn.value).toBe("Tossed Floral Studio Gripper No Show");
    expect(out.fields.designer).toEqual({ value: null, confidence: 0, source: null, page: null });
    expect(out.productAttrs.find((a) => a.key === "cuff")?.original).toBe("Hidden cuff");
    expect(out.productAttrs.find((a) => a.key === "toeSeam")).toMatchObject({ original: null, confidence: 0 });
  });

  it("falls back to the filename when the PDF has no text layer", () => {
    const out = offlinePlanningExtract({ purpose: "planning.extract", instructions: "", schema: planningExtractionSchema, document: { filename: "NSR_12810_FA27_Ribbed_Crew.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4\n%%EOF") } });
    expect(out.fields.styleNo).toMatchObject({ value: "12810", confidence: 0.4 });
    expect(out.fields.seasonCode.value).toBe("FA27");
    expect(out.fields.subCategory.value).toBe("CREW");
    expect(planningExtractionSchema.safeParse(out).success).toBe(true);
  });
});
