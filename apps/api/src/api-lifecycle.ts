type StoppableServer = {
  stop(closeActiveConnections?: boolean): Promise<void>;
};

type ClosablePool = {
  end(): Promise<void>;
};

type StoppableMonitor = {
  stop(): void;
};

type ApiShutdownDependencies = {
  server: StoppableServer;
  pools: readonly ClosablePool[];
  graceMs: number;
  monitor?: StoppableMonitor | null;
};

async function stopServerWithGrace(server: StoppableServer, graceMs: number) {
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const forcedStop = new Promise<void>((resolve, reject) => {
    forceTimer = setTimeout(() => {
      server.stop(true).then(resolve, reject);
    }, graceMs);
  });
  try {
    await Promise.race([server.stop(false), forcedStop]);
  } finally {
    if (forceTimer) clearTimeout(forceTimer);
  }
}

export function createApiShutdown(dependencies: ApiShutdownDependencies) {
  let shutdown: Promise<void> | null = null;
  return () => {
    shutdown ??= (async () => {
      const errors: unknown[] = [];
      try {
        dependencies.monitor?.stop();
      } catch (error) {
        errors.push(error);
      }
      try {
        await stopServerWithGrace(dependencies.server, dependencies.graceMs);
      } catch (error) {
        errors.push(error);
      }
      const closed = await Promise.allSettled(dependencies.pools.map((pool) => pool.end()));
      for (const result of closed) if (result.status === "rejected") errors.push(result.reason);
      if (errors.length > 0) throw new AggregateError(errors, "API shutdown failed");
    })();
    return shutdown;
  };
}
