import { expect, test } from "bun:test";
import { assertApprovedLocalDatabase, type DatabaseTargetIdentity } from "./local-database-guard";

const local: DatabaseTargetIdentity = {
  database: "notesia_dev",
  serverAddress: "127.0.0.1",
  serverPort: 5432,
  ciMarker: null,
};

test("local database guard accepts only the expected loopback database and port", () => {
  expect(() => assertApprovedLocalDatabase(local, "notesia_dev", {})).not.toThrow();
  expect(() =>
    assertApprovedLocalDatabase({ ...local, database: "unexpected_database" }, "notesia_dev", {}),
  ).toThrow();
  expect(() =>
    assertApprovedLocalDatabase({ ...local, serverPort: 8004 }, "notesia_dev", {}),
  ).toThrow();
});

test("local database guard accepts a marked GitHub Actions service database", () => {
  const marker = "notesia-ci-12345-1";
  const service = { ...local, serverAddress: "172.18.0.2", ciMarker: marker };
  expect(() =>
    assertApprovedLocalDatabase(service, "notesia_dev", {
      CI: "true",
      GITHUB_ACTIONS: "true",
      NOTESIA_CI_DATABASE_MARKER: marker,
    }),
  ).not.toThrow();
  expect(() =>
    assertApprovedLocalDatabase(service, "notesia_dev", {
      CI: "true",
      GITHUB_ACTIONS: "true",
      NOTESIA_CI_DATABASE_MARKER: "notesia-ci-12345-2",
    }),
  ).toThrow();
});

test("local database guard rejects unmarked or user-emulated remote targets", () => {
  const service = { ...local, serverAddress: "203.0.113.10", ciMarker: "notesia-ci-12345-1" };
  expect(() => assertApprovedLocalDatabase(service, "notesia_dev", {})).toThrow();
  expect(() =>
    assertApprovedLocalDatabase(service, "notesia_dev", {
      CI: "true",
      GITHUB_ACTIONS: "false",
      NOTESIA_CI_DATABASE_MARKER: "notesia-ci-12345-1",
    }),
  ).toThrow();
  expect(() =>
    assertApprovedLocalDatabase(service, "notesia_dev", {
      CI: "true",
      GITHUB_ACTIONS: "true",
      NOTESIA_CI_DATABASE_MARKER: "unbounded-marker",
    }),
  ).toThrow();
});
