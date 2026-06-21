import { describe, expect, it } from 'vitest';
import { evaluate, type EvaluationInput } from '../../src/domain/evaluator.js';
import type { GlobalPolicy, UserPreferences } from '../../src/domain/types.js';

function baseInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  const preferences: UserPreferences = {
    userId: 'u1',
    overrides: [],
    quietHours: null,
  };
  return {
    notificationType: 'marketing_email',
    channel: 'email',
    region: 'EU',
    instantUtc: new Date('2026-05-21T12:00:00Z'),
    preferences,
    policies: [],
    ...overrides,
  };
}

describe('evaluate — priority pipeline', () => {
  it('defaults: transactional allowed, marketing denied', () => {
    expect(evaluate(baseInput({ notificationType: 'transactional_email' }))).toEqual({
      decision: 'allow',
      reason: 'allowed_by_default',
    });
    expect(evaluate(baseInput({ notificationType: 'marketing_email' }))).toEqual({
      decision: 'deny',
      reason: 'blocked_by_user_preference',
    });
  });

  it('explicit opt-in allows a marketing type', () => {
    const input = baseInput({
      preferences: {
        userId: 'u1',
        overrides: [{ notificationType: 'marketing_email', channel: 'email', enabled: true }],
        quietHours: null,
      },
    });
    expect(evaluate(input)).toEqual({
      decision: 'allow',
      reason: 'allowed_by_user_preference',
    });
  });

  it('explicit opt-out denies', () => {
    const input = baseInput({
      notificationType: 'transactional_email',
      preferences: {
        userId: 'u1',
        overrides: [
          { notificationType: 'transactional_email', channel: 'email', enabled: false },
        ],
        quietHours: null,
      },
    });
    expect(evaluate(input)).toEqual({
      decision: 'deny',
      reason: 'blocked_by_user_preference',
    });
  });

  it('global policy with wildcard channel denies regardless of channel', () => {
    const policy: GlobalPolicy = {
      id: 'p1',
      notificationType: 'marketing_sms',
      channel: null,
      region: 'EU',
    };
    const input = baseInput({
      notificationType: 'marketing_sms',
      channel: 'sms',
      policies: [policy],
    });
    expect(evaluate(input)).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });

  it('global policy does not apply to a different region', () => {
    const policy: GlobalPolicy = {
      id: 'p1',
      notificationType: 'marketing_sms',
      channel: null,
      region: 'EU',
    };
    const input = baseInput({
      notificationType: 'marketing_sms',
      channel: 'sms',
      region: 'US',
      policies: [policy],
      preferences: {
        userId: 'u1',
        overrides: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }],
        quietHours: null,
      },
    });
    expect(evaluate(input).decision).toBe('allow');
  });

  it('quiet hours block non-transactional but not transactional', () => {
    const prefs: UserPreferences = {
      userId: 'u1',
      overrides: [
        { notificationType: 'marketing_push', channel: 'push', enabled: true },
        { notificationType: 'transactional_push', channel: 'push', enabled: true },
      ],
      quietHours: { start: '22:00', end: '08:00', timezone: 'Europe/Moscow' },
    };
    // 23:30 Moscow -> inside quiet hours
    const instantUtc = new Date('2026-05-21T20:30:00Z');

    expect(
      evaluate(
        baseInput({
          notificationType: 'marketing_push',
          channel: 'push',
          preferences: prefs,
          instantUtc,
        }),
      ),
    ).toEqual({ decision: 'deny', reason: 'blocked_by_quiet_hours' });

    expect(
      evaluate(
        baseInput({
          notificationType: 'transactional_push',
          channel: 'push',
          preferences: prefs,
          instantUtc,
        }),
      ),
    ).toEqual({ decision: 'allow', reason: 'allowed_by_user_preference' });
  });

  it('priority: global policy deny beats explicit user opt-in', () => {
    const policy: GlobalPolicy = {
      id: 'p1',
      notificationType: 'marketing_sms',
      channel: 'sms',
      region: 'EU',
    };
    const input = baseInput({
      notificationType: 'marketing_sms',
      channel: 'sms',
      policies: [policy],
      preferences: {
        userId: 'u1',
        overrides: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }],
        quietHours: null,
      },
    });
    expect(evaluate(input)).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });
});
