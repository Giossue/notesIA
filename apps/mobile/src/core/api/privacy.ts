import {
  consentAcceptSchema,
  consentListSchema,
  consentRecordSchema,
  privacyDocumentListSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listPrivacyDocuments(language: "es" | "en") {
  return requestJson(`/privacy/documents?language=${language}`, privacyDocumentListSchema);
}

export function listConsents() {
  return requestJson("/me/consents", consentListSchema);
}

export function acceptConsent(documentId: string) {
  return requestJson("/me/consents", consentRecordSchema, {
    method: "POST",
    body: consentAcceptSchema.parse({ documentId }),
  });
}

export function revokeAiConsent() {
  return requestJson("/me/consents/ai/revoke", consentRecordSchema.nullable(), { method: "POST" });
}
