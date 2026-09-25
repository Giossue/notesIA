import { aiSuggestionResponseSchema, aiUseCaseSchema } from "@notesia/contracts";
import { requestJson } from "./client";

export function requestAiSuggestion(useCase: string, payload: unknown) {
  const parsedUseCase = aiUseCaseSchema.parse(useCase);
  return requestJson(`/ai/${parsedUseCase}/suggestions`, aiSuggestionResponseSchema, {
    method: "POST",
    body: payload,
    timeoutMs: 35_000,
  });
}
