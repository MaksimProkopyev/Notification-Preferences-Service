import pino from 'pino';
import type { Logger, Metrics } from '../application/ports.js';

/** pino-backed structured JSON logger adapted to the application Logger port. */
export function createLogger(level: string): Logger & { raw: pino.Logger } {
  const raw = pino({ level, base: { service: 'notification-preferences' } });
  return {
    raw,
    info: (obj, msg) => raw.info(obj, msg),
    warn: (obj, msg) => raw.warn(obj, msg),
    error: (obj, msg) => raw.error(obj, msg),
  };
}

/**
 * Logging metrics sink. In production this seam would be backed by StatsD /
 * Prometheus / OpenTelemetry. Suggested metrics to wire up:
 *   - evaluate.latency_ms        (timer)  — p50/p95/p99 of evaluate latency
 *   - evaluate.decision          (counter, tags: decision, reason)
 *   - preferences.update         (counter) — write volume
 *   - repository.query_ms        (timer, tags: query) — DB hot spots
 */
export function createMetrics(logger: Logger): Metrics {
  return {
    increment: (name, tags) => logger.info({ metric: name, tags, kind: 'counter' }, 'metric'),
    timing: (name, ms, tags) =>
      logger.info({ metric: name, ms, tags, kind: 'timing' }, 'metric'),
  };
}
