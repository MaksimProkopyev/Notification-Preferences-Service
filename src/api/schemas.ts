import { z } from 'zod';
import { CHANNELS, NOTIFICATION_TYPES } from '../domain/types.js';
import { isValidTimezone, parseHHmm } from '../domain/quietHours.js';

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const channelSchema = z.enum(CHANNELS);

const hhmm = z.string().refine(
  (v) => {
    try {
      parseHHmm(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be HH:mm (24h)' },
);

export const quietHoursSchema = z.object({
  start: hhmm,
  end: hhmm,
  timezone: z.string().refine(isValidTimezone, { message: 'invalid IANA timezone' }),
});

export const updatePreferencesBodySchema = z.object({
  updates: z
    .array(
      z.object({
        notificationType: notificationTypeSchema,
        channel: channelSchema,
        enabled: z.boolean(),
      }),
    )
    .default([]),
  // omitted => leave unchanged; null => clear; object => set
  quietHours: quietHoursSchema.nullish(),
});

export const evaluateBodySchema = z.object({
  userId: z.string().min(1),
  notificationType: notificationTypeSchema,
  channel: channelSchema,
  region: z.string().min(1),
  datetime: z.string().datetime({ offset: true }),
});

export const createPolicyBodySchema = z.object({
  notificationType: notificationTypeSchema,
  channel: channelSchema.nullable().default(null),
  region: z.string().min(1),
});

export const userIdParamSchema = z.object({ id: z.string().min(1) });

export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;
export type EvaluateBody = z.infer<typeof evaluateBodySchema>;
export type CreatePolicyBody = z.infer<typeof createPolicyBodySchema>;
