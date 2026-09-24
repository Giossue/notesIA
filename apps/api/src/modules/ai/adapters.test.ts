import { expect, test } from "bun:test";
import { type AiFetch, type AiProvider, generateWithProvider } from "./adapters";
import { aiCases } from "./cases";
import { createAiKeyCipher } from "./key-cipher";

const structured = JSON.stringify({ title: "Resumen", description: "Estudiar biología" });
const fixtures = {
  openai: {
    status: "completed",
    output: [{ content: [{ type: "output_text", text: structured }] }],
    usage: { input_tokens: 15, output_tokens: 8 },
  },
  anthropic: {
    stop_reason: "end_turn",
    content: [{ type: "text", text: structured }],
    usage: { input_tokens: 15, output_tokens: 8 },
  },
  deepseek: {
    choices: [{ finish_reason: "stop", message: { content: structured } }],
    usage: { prompt_tokens: 15, completion_tokens: 8 },
  },
};

for (const provider of ["openai", "anthropic", "deepseek"] as const) {
  test(`${provider} adapter sends constrained JSON and reads usage`, async () => {
    let outbound: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
    const fetcher: AiFetch = async (url, init) => {
      outbound = { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return Response.json(fixtures[provider]);
    };
    const result = await generateWithProvider(
      {
        provider,
        apiKey: "test-secret",
        modelId: "test-model-1",
        timeoutMs: 3000,
        maxOutputTokens: 256,
      },
      "extract_activity",
      aiCases.extract_activity.instruction,
      aiCases.extract_activity.jsonSchema,
      { text: "Preparar un resumen" },
      fetcher,
    );
    expect(JSON.parse(result.text)).toEqual({ title: "Resumen", description: "Estudiar biología" });
    expect(result).toMatchObject({ inputTokens: 15, outputTokens: 8, usageReported: true });
    expect(outbound).not.toBeNull();
    if (!outbound) throw new Error("Expected provider request");
    const sent = outbound as { url: string; headers: Headers; body: Record<string, unknown> };
    expect(sent.url).toContain(
      provider === "anthropic"
        ? "api.anthropic.com"
        : provider === "openai"
          ? "api.openai.com"
          : "api.deepseek.com",
    );
    expect(JSON.stringify(sent.body)).not.toContain("test-secret");
    expect(sent.body.model).toBe("test-model-1");
    if (provider === "openai") {
      expect(sent.headers.get("authorization")).toBe("Bearer test-secret");
      expect(sent.body.store).toBe(false);
      expect(sent.body.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    } else if (provider === "anthropic") {
      expect(sent.headers.get("x-api-key")).toBe("test-secret");
      expect(sent.headers.get("anthropic-version")).toBe("2023-06-01");
      expect(sent.body.output_config).toMatchObject({ format: { type: "json_schema" } });
    } else {
      expect(sent.headers.get("authorization")).toBe("Bearer test-secret");
      expect(sent.body.response_format).toEqual({ type: "json_object" });
    }
  });
}

test("missing provider usage stays unknown, distinct from reported zero", async () => {
  const request = (usage: unknown) =>
    generateWithProvider(
      {
        provider: "openai",
        apiKey: "test-secret",
        modelId: "test-model-1",
        timeoutMs: 3000,
        maxOutputTokens: 256,
      },
      "extract_activity",
      aiCases.extract_activity.instruction,
      aiCases.extract_activity.jsonSchema,
      { text: "Resumen" },
      async () => Response.json({ ...fixtures.openai, usage }),
    );
  expect(await request(undefined)).toMatchObject({
    inputTokens: 0,
    outputTokens: 0,
    usageReported: false,
  });
  expect(await request({ input_tokens: 0, output_tokens: 0 })).toMatchObject({
    inputTokens: 0,
    outputTokens: 0,
    usageReported: true,
  });
});

test("adapter rejects incomplete or refused output", async () => {
  for (const [provider, response] of [
    ["openai", { status: "completed", output: [{ content: [{ type: "refusal" }] }] }],
    ["anthropic", { stop_reason: "max_tokens", content: [{ type: "text", text: structured }] }],
    ["deepseek", { choices: [{ finish_reason: "length", message: { content: structured } }] }],
  ] as const) {
    await expect(
      generateWithProvider(
        {
          provider: provider as AiProvider,
          apiKey: "test-secret",
          modelId: "test-model-1",
          timeoutMs: 3000,
          maxOutputTokens: 256,
        },
        "extract_activity",
        aiCases.extract_activity.instruction,
        aiCases.extract_activity.jsonSchema,
        { text: "Resumen" },
        async () => Response.json(response),
      ),
    ).rejects.toThrow();
  }
});

test("adapter bounds provider response before JSON parsing", async () => {
  await expect(
    generateWithProvider(
      {
        provider: "openai",
        apiKey: "test-secret",
        modelId: "test-model-1",
        timeoutMs: 3000,
        maxOutputTokens: 256,
      },
      "extract_activity",
      aiCases.extract_activity.instruction,
      aiCases.extract_activity.jsonSchema,
      { text: "Resumen" },
      async () => new Response("x".repeat(200001)),
    ),
  ).rejects.toThrow("AI_RESPONSE_TOO_LARGE");
});

test("provider keys are authenticated ciphertext and bound to the provider", () => {
  const cipher = createAiKeyCipher(
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  );
  const encrypted = cipher.encrypt("openai", "test-secret");
  expect(encrypted.toString()).not.toContain("test-secret");
  expect(cipher.decrypt("openai", encrypted)).toBe("test-secret");
  expect(() => cipher.decrypt("deepseek", encrypted)).toThrow();
});
