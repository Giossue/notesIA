import type { OperationalAlertConfig } from "@notesia/config";
import {
  createOperationalAlertReporter,
  evaluateHealthAlerts,
  type OperationalAlertReporter,
  type OperationalHealth,
  type OperationalMonitorObservation,
  writeOperationalMonitorObservation,
} from "@notesia/observability";

type Dependencies = {
  config: OperationalAlertConfig;
  readHealth(): Promise<OperationalHealth>;
  reporter?: Pick<OperationalAlertReporter, "report">;
  observe?: (event: OperationalMonitorObservation) => void;
};

export function createOperationalMonitor(dependencies: Dependencies) {
  const reporter =
    dependencies.reporter ??
    createOperationalAlertReporter({
      webhookUrl: dependencies.config.webhookUrl,
      secret: dependencies.config.secret,
      source: dependencies.config.source,
      repeatIntervalMs: dependencies.config.repeatIntervalMs,
    });
  const observe = dependencies.observe ?? writeOperationalMonitorObservation;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  const check = async () => {
    const started = performance.now();
    let activeAlerts = 0;
    try {
      const alerts = evaluateHealthAlerts(await dependencies.readHealth());
      activeAlerts = alerts.length;
      const outcome = await reporter.report(alerts);
      observe({
        outcome,
        activeAlerts,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
      });
    } catch {
      observe({
        outcome: "error",
        activeAlerts,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
      });
    }
  };

  const schedule = () => {
    timer = setTimeout(async () => {
      timer = undefined;
      await check();
      if (!stopped) schedule();
    }, dependencies.config.checkIntervalMs);
    timer.unref();
  };

  return {
    check,
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
