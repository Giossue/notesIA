import type { AiUseCase } from "./cases";

export type AiProvider = "openai" | "anthropic" | "deepseek";
export type AiRoute = {
  provider: AiProvider;
  modelId: string;
  apiKey: string;
  timeoutMs: number;
  maxOutputTokens: number;
};
export type AiAdapterResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  usageReported: boolean;
};
export type AiFetch = (url: string, init: RequestInit) => Promise<Response>;

type ResponseShape = Record<string, unknown>;
const MAX_RESPONSE_BYTES = 200000;

async function readBoundedResponse(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES)
    throw new Error("AI_RESPONSE_TOO_LARGE");
  if (!response.body) throw new Error("AI_MISSING_OUTPUT");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("AI_RESPONSE_TOO_LARGE");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647
    ? value
    : 0;
}

function reportedTokens(input: unknown, output: unknown) {
  return {
    inputTokens: tokenCount(input),
    outputTokens: tokenCount(output),
    usageReported:
      typeof input === "number" &&
      typeof output === "number" &&
      Number.isInteger(input) &&
      Number.isInteger(output) &&
      input >= 0 &&
      output >= 0 &&
      input <= 2147483647 &&
      output <= 2147483647,
  };
}

export async function generateWithProvider(
  route: AiRoute,
  useCase: AiUseCase,
  instruction: string,
  jsonSchema: Record<string, unknown>,
  payload: unknown,
  fetcher: AiFetch = fetch,
): Promise<AiAdapterResult> {
  const message = JSON.stringify(payload);
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;
  if (route.provider === "openai") {
    url = "https://api.openai.com/v1/responses";
    headers = { Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" };
    body = {
      model: route.modelId,
      instructions: instruction,
      input: message,
      text: { format: { type: "json_schema", name: useCase, schema: jsonSchema, strict: true } },
      max_output_tokens: route.maxOutputTokens,
      store: false,
    };
  } else if (route.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "x-api-key": route.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
    body = {
      model: route.modelId,
      system: instruction,
      messages: [{ role: "user", content: message }],
      max_tokens: route.maxOutputTokens,
      output_config: { format: { type: "json_schema", schema: jsonSchema } },
      // Sonnet 5 piensa por defecto: gastaría el tope de tokens antes del JSON y
      // tardaría más. Estas respuestas son cortas y no lo necesitan.
      ...(route.modelId.startsWith("claude-sonnet-5") ? { thinking: { type: "disabled" } } : {}),
    };
  } else {
    url = "https://api.deepseek.com/chat/completions";
    headers = { Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" };
    body = {
      model: route.modelId,
      messages: [
        { role: "system", content: `${instruction} Responde únicamente con JSON válido.` },
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      max_tokens: route.maxOutputTokens,
      stream: false,
    };
  }
  const response = await fetcher(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(route.timeoutMs),
  });
  if (!response.ok) throw new Error("AI_PROVIDER_ERROR");
  const raw = await readBoundedResponse(response);
  const data = JSON.parse(raw) as ResponseShape;
  if (route.provider === "openai") {
    if (data.status !== "completed") throw new Error("AI_INCOMPLETE");
    const output = Array.isArray(data.output) ? data.output : [];
    const texts = output.flatMap((item) => {
      const content = (item as ResponseShape).content;
      return Array.isArray(content)
        ? content
            .filter((part) => part?.type === "output_text" && typeof part.text === "string")
            .map((part) => part.text as string)
        : [];
    });
    if (texts.length !== 1) throw new Error("AI_MISSING_OUTPUT");
    const usage = (data.usage ?? {}) as ResponseShape;
    return {
      text: texts[0],
      ...reportedTokens(usage.input_tokens, usage.output_tokens),
    };
  }
  if (route.provider === "anthropic") {
    if (data.stop_reason !== "end_turn") throw new Error("AI_INCOMPLETE");
    const content = Array.isArray(data.content) ? data.content : [];
    const texts = content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string);
    if (texts.length !== 1) throw new Error("AI_MISSING_OUTPUT");
    const usage = (data.usage ?? {}) as ResponseShape;
    return {
      text: texts[0],
      ...reportedTokens(usage.input_tokens, usage.output_tokens),
    };
  }
  const choice = Array.isArray(data.choices)
    ? (data.choices[0] as ResponseShape | undefined)
    : undefined;
  const content = (choice?.message as ResponseShape | undefined)?.content;
  if (choice?.finish_reason !== "stop" || typeof content !== "string")
    throw new Error("AI_INCOMPLETE");
  const usage = (data.usage ?? {}) as ResponseShape;
  return {
    text: content,
    ...reportedTokens(usage.prompt_tokens, usage.completion_tokens),
  };
}
