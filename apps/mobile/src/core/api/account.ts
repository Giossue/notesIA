import {
  accountDeletionCancelSchema,
  accountDeletionRequestSchema,
  accountDeletionStatusSchema,
  accountExportFileSchema,
  accountExportRequestSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { requestJson } from "./client";

const emptyResponseSchema = z.null();

/** Todos los datos de la cuenta en un Excel, con una hoja por tipo de dato. */
export function exportAccountExcel(password: string) {
  return requestJson("/me/export", accountExportFileSchema, {
    method: "POST",
    body: accountExportRequestSchema.parse({ password, format: "xlsx" }),
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
