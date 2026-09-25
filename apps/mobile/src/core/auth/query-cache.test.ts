import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateCache } from "./query-cache";

test("clears all cached student data while retaining the session query", async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["session"], { id: "student-a" });
  queryClient.setQueryData(["profile"], { email: "student-a@example.test" });
  queryClient.setQueryData(["subjects", false], { items: ["private-subject"] });
  queryClient.setQueryData(["activities", "active"], { items: ["private-activity"] });
  queryClient.setQueryData(["subtasks", "activity-a", false], { items: ["private-subtask"] });
  queryClient.setQueryData(["agenda", "2026-09-23"], { items: ["private-deadline"] });

  let localCleared = false;
  await clearPrivateCache(queryClient, async () => {
    localCleared = true;
  });

  expect(queryClient.getQueryData(["session"])).toEqual({ id: "student-a" });
  for (const key of [
    ["profile"],
    ["subjects", false],
    ["activities", "active"],
    ["subtasks", "activity-a", false],
    ["agenda", "2026-09-23"],
  ]) {
    expect(queryClient.getQueryData(key)).toBeUndefined();
  }
  expect(localCleared).toBe(true);
  queryClient.clear();
});
