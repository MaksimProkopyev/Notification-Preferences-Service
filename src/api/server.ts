import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AppDependencies } from '../container.js';
import {
  createPolicyBodySchema,
  evaluateBodySchema,
  updatePreferencesBodySchema,
  userIdParamSchema,
} from './schemas.js';

/**
 * Builds the HTTP server. The API layer is responsible only for: validating
 * input at the boundary (zod), mapping to/from DTOs, and delegating to
 * use-cases. No business logic lives here.
 */
export function buildServer(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', details: err.issues });
    }
    deps.logger.error({ err: String(err) }, 'unhandled_error');
    return reply.status(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  // GET /users/:id/preferences — lazy-creates unknown users with defaults.
  app.get('/users/:id/preferences', async (req, reply) => {
    const { id } = userIdParamSchema.parse(req.params);
    const result = await deps.getUserPreferences.execute(id);
    return reply.send(result);
  });

  // POST /users/:id/preferences — idempotent upsert of overrides + quiet hours.
  app.post('/users/:id/preferences', async (req, reply) => {
    const { id } = userIdParamSchema.parse(req.params);
    const body = updatePreferencesBodySchema.parse(req.body);
    const result = await deps.updateUserPreferences.execute({
      userId: id,
      updates: body.updates,
      // Distinguish "omitted" (undefined) from "clear" (null).
      ...(body.quietHours !== undefined ? { quietHours: body.quietHours } : {}),
    });
    return reply.send(result);
  });

  // POST /evaluate — the allow/deny decision.
  app.post('/evaluate', async (req, reply) => {
    const body = evaluateBodySchema.parse(req.body);
    const result = await deps.evaluateNotification.execute({
      userId: body.userId,
      notificationType: body.notificationType,
      channel: body.channel,
      region: body.region,
      instantUtc: new Date(body.datetime),
    });
    return reply.send(result);
  });

  // POST /policies — create a global policy (demo/admin helper).
  app.post('/policies', async (req, reply) => {
    const body = createPolicyBodySchema.parse(req.body);
    const policy = await deps.policyRepository.create({
      notificationType: body.notificationType,
      channel: body.channel,
      region: body.region,
    });
    return reply.status(201).send(policy);
  });

  return app;
}
