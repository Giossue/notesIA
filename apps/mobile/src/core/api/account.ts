import {
  accountDeletionCancelSchema,
  accountDeletionRequestSchema,
  accountDeletionStatusSchema,
  accountExportRequestSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { requestJson, requestText } from "./client";

const emptyResponseSchema = z.null();

export function exportAccount(password: string) {
  return requestText("/me/export", {
    method: "POST",
    body: accountExportRequestSchema.parse({ password }),
    timeoutMs: 60_000,
  });
}

export function getDeletionRequest() {
  return requestJson("/me/deletion-request", accountDeletionStatusSchema.nullable());
}

export function requestAccountDeletion(password: string, confirmation: string) {
  return requestJson("/me/deletion-request", accountDeletionStatusSchema, {
    method: "POST",
    body: accountDeletionRequestSchema.parse({ password, confirmation }),
  });
}

export function cancelAccountDeletion(password: string, confirmation: string) {
  return requestJson("/me/deletion-request", emptyResponseSchema, {
    method: "DELETE",
    body: accountDeletionCancelSchema.parse({ password, confirmation }),
  });
}
