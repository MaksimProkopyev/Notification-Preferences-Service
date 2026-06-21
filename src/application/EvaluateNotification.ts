import { evaluate, type EvaluationResult } from '../domain/evaluator.js';
import type { Channel, NotificationType, Region } from '../domain/types.js';
import type {
  Logger,
  Metrics,
  PolicyRepository,
  PreferencesRepository,
  UserRepository,
} from './ports.js';

export interface EvaluateCommand {
  readonly userId: string;
  readonly notificationType: NotificationType;
  readonly channel: Channel;
  readonly region: Region;
  /** UTC instant the notification would be sent at. */
  readonly instantUtc: Date;
}

/**
 * Orchestrates an evaluate request: loads the user's preferences + applicable
 * global policies, then defers the actual allow/deny decision to the pure
 * domain `evaluate` function. Unknown users are lazily created so a fresh user
 * resolves against defaults rather than erroring.
 */
export class EvaluateNotification {
  constructor(
    private readonly users: UserRepository,
    private readonly prefs: PreferencesRepository,
    private readonly policies: PolicyRepository,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
  ) {}

  async execute(cmd: EvaluateCommand): Promise<EvaluationResult> {
    const startedAt = Date.now();
    await this.users.ensureExists(cmd.userId);

    const [preferences, policies] = await Promise.all([
      this.prefs.getPreferences(cmd.userId),
      this.policies.findByRegion(cmd.region),
    ]);

    const result = evaluate({
      notificationType: cmd.notificationType,
      channel: cmd.channel,
      region: cmd.region,
      instantUtc: cmd.instantUtc,
      preferences,
      policies,
    });

    const elapsed = Date.now() - startedAt;
    this.metrics.timing('evaluate.latency_ms', elapsed);
    this.metrics.increment('evaluate.decision', {
      decision: result.decision,
      reason: result.reason,
    });
    this.logger.info(
      {
        userId: cmd.userId,
        notificationType: cmd.notificationType,
        channel: cmd.channel,
        region: cmd.region,
        decision: result.decision,
        reason: result.reason,
        latencyMs: elapsed,
      },
      'evaluate_decision',
    );

    return result;
  }
}
