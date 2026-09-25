import {
  pushDeviceListSchema,
  pushDeviceRegisterSchema,
  pushDeviceSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { requestJson } from "./client";

const registeredDeviceSchema = pushDeviceSchema.pick({ id: true, platform: true }).extend({
  registered: z.literal(true),
});

export function listPushDevices() {
  return requestJson("/me/push-devices", pushDeviceListSchema);
}

export function registerPushDevice(input: unknown) {
  return requestJson("/me/push-devices", registeredDeviceSchema, {
    method: "POST",
    body: pushDeviceRegisterSchema.parse(input),
  });
}

export function removePushDevice(id: string) {
  return requestJson(`/me/push-devices/${encodeURIComponent(id)}`, z.null(), {
    method: "DELETE",
  });
}
