import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/buildTestApp.js';
import type { InMemoryPreferencesRepository } from '../../src/infrastructure/repositories/InMemoryRepositories.js';
import type { EffectiveSetting } from '../../src/domain/effective.js';

interface PrefsResponse {
  userId: string;
  settings: EffectiveSetting[];
  quietHours: unknown;
}

function find(settings: EffectiveSetting[], type: string, channel: string): EffectiveSetting {
  const s = settings.find((x) => x.notificationType === type && x.channel === channel);
  if (!s) throw new Error(`setting ${type}/${channel} not found`);
  return s;
}

describe('HTTP API', () => {
  let app: FastifyInstance;
  let prefs: InMemoryPreferencesRepository;

  beforeEach(() => {
    const built = buildTestApp();
    app = built.app;
    prefs = built.prefs;
  });
  afterEach(async () => {
    await app.close();
  });

  it('scenario 1: new user gets defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/new-user/preferences' });
    expect(res.statusCode).toBe(200);
    const body = res.json<PrefsResponse>();
    expect(find(body.settings, 'transactional_email', 'email').enabled).toBe(true);
    expect(find(body.settings, 'marketing_email', 'email').enabled).toBe(false);
  });

  it('scenario 2: opting out of marketing_email reflects in GET; transactional stays on', async () => {
    await app.inject({
      method: 'POST',
      url: '/users/u2/preferences',
      payload: {
        updates: [{ notificationType: 'marketing_email', channel: 'email', enabled: false }],
      },
    });
    const res = await app.inject({ method: 'GET', url: '/users/u2/preferences' });
    const body = res.json<PrefsResponse>();
    const me = find(body.settings, 'marketing_email', 'email');
    expect(me.enabled).toBe(false);
    expect(me.source).toBe('user');
    expect(find(body.settings, 'transactional_email', 'email').enabled).toBe(true);
  });

  it('scenario 3: quiet hours block marketing_push but not transactional_push', async () => {
    await app.inject({
      method: 'POST',
      url: '/users/u3/preferences',
      payload: {
        updates: [
          { notificationType: 'marketing_push', channel: 'push', enabled: true },
        ],
        quietHours: { start: '22:00', end: '08:00', timezone: 'Europe/Moscow' },
      },
    });

    // 23:30 Moscow == 20:30Z -> inside quiet hours
    const marketing = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u3',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'US',
        datetime: '2026-05-21T20:30:00Z',
      },
    });
    expect(marketing.json()).toEqual({ decision: 'deny', reason: 'blocked_by_quiet_hours' });

    const transactional = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u3',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'US',
        datetime: '2026-05-21T20:30:00Z',
      },
    });
    expect(transactional.json().decision).toBe('allow');
  });

  it('scenario 4: global policy denies marketing_sms in EU regardless of user prefs', async () => {
    await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { notificationType: 'marketing_sms', channel: null, region: 'EU' },
    });
    await app.inject({
      method: 'POST',
      url: '/users/u4/preferences',
      payload: {
        updates: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u4',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      },
    });
    expect(res.json()).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
  });

  it('scenario 5: idempotent POST does not create duplicate rows', async () => {
    const payload = {
      updates: [{ notificationType: 'marketing_email', channel: 'email', enabled: false }],
      quietHours: { start: '22:00', end: '08:00', timezone: 'Europe/Moscow' },
    };
    const first = await app.inject({ method: 'POST', url: '/users/u5/preferences', payload });
    const second = await app.inject({ method: 'POST', url: '/users/u5/preferences', payload });

    expect(first.json()).toEqual(second.json());
    expect(prefs.countOverrides('u5')).toBe(1);
  });

  it('scenario 6: global policy deny beats user opt-in (priority)', async () => {
    await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { notificationType: 'marketing_sms', channel: 'sms', region: 'EU' },
    });
    await app.inject({
      method: 'POST',
      url: '/users/u6/preferences',
      payload: {
        updates: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u6',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      },
    });
    expect(res.json()).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
  });

  it('rejects invalid input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'x',
        notificationType: 'not_a_type',
        channel: 'email',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });
});
