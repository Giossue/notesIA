import {
  adminAiProviderListSchema,
  adminAiProviderSchema,
  adminAiProviderUpdateSchema,
  adminAiRouteListSchema,
  adminAiRouteSchema,
  adminAiRouteUpdateSchema,
  adminAiUsageSchema,
  adminAuditPageSchema,
  adminDocumentCreateSchema,
  adminDocumentPageSchema,
  adminDocumentSchema,
  adminMeSchema,
  adminPublishSchema,
  adminReportDetailSchema,
  adminReportPageSchema,
  adminReportSchema,
  adminReportUpdateSchema,
  adminRolePageSchema,
  adminRoleRemoveSchema,
  adminRoleUpdateSchema,
  adminSystemHealthSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  adminUserStateSchema,
  adminUserSuspensionSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { apiRequest } from "./api";

const roleUpdateResultSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["admin", "support"]),
  version: z.number().int().positive(),
});
const roleRemoveResultSchema = z.object({ userId: z.uuid(), removed: z.literal(true) });
const routeTestResultSchema = z.object({ ok: z.literal(true) });

function withCursor(path: `/v1/${string}`, cursor?: string | null) {
  return cursor ? (`${path}?cursor=${encodeURIComponent(cursor)}` as `/v1/${string}`) : path;
}

export type AdminReport = z.infer<typeof adminReportSchema>;
export type AdminReportDetail = z.infer<typeof adminReportDetailSchema>;
export type ReportStatus = AdminReport["status"];
export type AdminAudit = z.infer<typeof adminAuditPageSchema>["items"][number];
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminUser = z.infer<typeof adminUserPageSchema>["items"][number];
export type AdminRole = z.infer<typeof adminRolePageSchema>["items"][number];
export type AdminDocument = z.infer<typeof adminDocumentSchema>;
export type AdminAiProvider = z.infer<typeof adminAiProviderSchema>;
export type AdminAiRoute = z.infer<typeof adminAiRouteSchema>;
export type AdminAiRouteUpdate = z.infer<typeof adminAiRouteUpdateSchema>;

export const adminApi = {
  me: () => apiRequest("/v1/admin/me", adminMeSchema),
  reports: (status: ReportStatus | null, cursor?: string | null) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);
    const search = query.toString();
    return apiRequest(`/v1/admin/reports${search ? `?${search}` : ""}`, adminReportPageSchema);
  },
  report: (reportId: string) =>
    apiRequest(`/v1/admin/reports/${reportId}`, adminReportDetailSchema),
  updateReport: (reportId: string, input: z.infer<typeof adminReportUpdateSchema>) =>
    apiRequest(`/v1/admin/reports/${reportId}`, adminReportSchema, {
      method: "PATCH",
      body: adminReportUpdateSchema.parse(input),
    }),
  systemHealth: () => apiRequest("/v1/admin/system-health", adminSystemHealthSchema),
  users: (cursor?: string | null) =>
    apiRequest(withCursor("/v1/admin/users", cursor), adminUserPageSchema),
  userDetail: (userId: string) => apiRequest(`/v1/admin/users/${userId}`, adminUserDetailSchema),
  setSuspension: (userId: string, input: z.infer<typeof adminUserSuspensionSchema>) =>
    apiRequest(`/v1/admin/users/${userId}/suspension`, adminUserStateSchema, {
      method: "PUT",
      body: adminUserSuspensionSchema.parse(input),
    }),
  roles: (cursor?: string | null) =>
    apiRequest(withCursor("/v1/admin/roles", cursor), adminRolePageSchema),
  assignRole: (userId: string, input: z.infer<typeof adminRoleUpdateSchema>) =>
    apiRequest(`/v1/admin/roles/${userId}`, roleUpdateResultSchema, {
      method: "PUT",
      body: adminRoleUpdateSchema.parse(input),
    }),
  removeRole: (userId: string, input: z.infer<typeof adminRoleRemoveSchema>) =>
    apiRequest(`/v1/admin/roles/${userId}`, roleRemoveResultSchema, {
      method: "DELETE",
      body: adminRoleRemoveSchema.parse(input),
    }),
  documents: (cursor?: string | null) =>
    apiRequest(withCursor("/v1/admin/privacy-documents", cursor), adminDocumentPageSchema),
  createDocument: (input: z.infer<typeof adminDocumentCreateSchema>) =>
    apiRequest("/v1/admin/privacy-documents", adminDocumentSchema, {
      method: "POST",
      body: adminDocumentCreateSchema.parse(input),
    }),
  publishDocument: (id: string, input: z.infer<typeof adminPublishSchema>) =>
    apiRequest(`/v1/admin/privacy-documents/${id}/publish`, adminDocumentSchema, {
      method: "POST",
      body: adminPublishSchema.parse(input),
    }),
  audit: (cursor?: string | null) =>
    apiRequest(withCursor("/v1/admin/audit", cursor), adminAuditPageSchema),
  aiProviders: () => apiRequest("/v1/admin/ai/providers", adminAiProviderListSchema),
  updateAiProvider: (
    provider: z.infer<typeof adminAiProviderSchema>["provider"],
    input: z.infer<typeof adminAiProviderUpdateSchema>,
  ) =>
    apiRequest(`/v1/admin/ai/providers/${provider}`, adminAiProviderSchema, {
      method: "PUT",
      body: adminAiProviderUpdateSchema.parse(input),
    }),
  aiRoutes: () => apiRequest("/v1/admin/ai/routes", adminAiRouteListSchema),
  updateAiRoute: (useCase: string, input: AdminAiRouteUpdate) =>
    apiRequest(`/v1/admin/ai/routes/${useCase}`, adminAiRouteSchema, {
      method: "PUT",
      body: adminAiRouteUpdateSchema.parse(input),
    }),
  testAiRoute: (useCase: string) =>
    apiRequest(`/v1/admin/ai/routes/${useCase}/test`, routeTestResultSchema, {
      method: "POST",
    }),
  aiUsage: (from: string, through: string) =>
    apiRequest(
      `/v1/admin/ai/usage?from=${encodeURIComponent(from)}&through=${encodeURIComponent(through)}`,
      adminAiUsageSchema,
    ),
};
