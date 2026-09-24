export type DatabaseTargetIdentity = {
  database: string;
  serverAddress: string | null;
  serverPort: number;
  ciMarker: string | null;
};

const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ciMarkerPattern = /^notesia-ci-[1-9]\d*-[1-9]\d*$/;

export function assertApprovedLocalDatabase(
  identity: DatabaseTargetIdentity,
  expectedDatabase: string,
  env: NodeJS.ProcessEnv,
) {
  const directLocal =
    identity.serverAddress !== null && loopbackAddresses.has(identity.serverAddress);
  const expectedCiMarker = env.NOTESIA_CI_DATABASE_MARKER;
  const ephemeralCi =
    env.CI === "true" &&
    env.GITHUB_ACTIONS === "true" &&
    typeof expectedCiMarker === "string" &&
    ciMarkerPattern.test(expectedCiMarker) &&
    identity.ciMarker === expectedCiMarker;
  if (
    identity.database !== expectedDatabase ||
    identity.serverPort !== 5432 ||
    (!directLocal && !ephemeralCi)
  )
    throw new Error("Database target is not an approved local or ephemeral CI instance");
}

export const databaseTargetIdentitySql = `SELECT current_database() AS database,
  host(inet_server_addr()) AS "serverAddress", inet_server_port() AS "serverPort",
  (SELECT shobj_description(oid, 'pg_database') FROM pg_database
   WHERE datname = 'notesia_dev') AS "ciMarker"`;
