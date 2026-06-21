# Notification Preferences Service

Single source of truth for **"may we send user X notification of type T over channel C right now?"**, taking into account default policies, per-user overrides, global region policies, and per-user quiet hours (timezone-aware).

## Stack & key decisions

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | No `any`; domain rules are fully typed. |
| Web framework | **Fastify** | Lightweight, first-class `app.inject()` for fast in-process HTTP tests, built-in async error handling. |
| DB access | **Kysely** (typed query builder) + **raw SQL migrations** | Type-safe SQL without the heavy codegen/runtime of a full ORM; migrations stay plain, reviewable `.sql`. |
| Validation | **zod** at the API boundary | Parse-don't-validate; invalid input never reaches use-cases. |
| Time/timezone | **luxon** | Correct IANA-timezone conversion for quiet hours. |
| Logging | **pino** (JSON) | Structured logs for the two key events: preference changes and evaluate decisions. |
| Tests | **Vitest** | Fast, ESM-native. |

## Architecture (layers)

```
src/
  domain/          pure types + business rules (NO framework / DB imports)
    types.ts         NotificationType, Channel, Region, UserPreferences, GlobalPolicy, QuietHours
    defaults.ts      default enablement (transactional_* on, marketing_* off)
    quietHours.ts    timezone-aware, midnight-wrapping quiet-hours check
    evaluator.ts     the allow/deny pipeline with explicit reason codes
    effective.ts     expand sparse overrides into the full effective grid
  application/     use-cases orchestrating domain + repositories (ports)
    ports.ts         repository + Logger + Metrics interfaces
    GetUserPreferences.ts / UpdateUserPreferences.ts / EvaluateNotification.ts
  infrastructure/  Postgres repos, migrations, config, logger, metrics
    db/ (schema, connection, migrate, seed)
    repositories/ (Postgres*, InMemory*)
  api/             HTTP layer: Fastify routes, zod schemas
  container.ts     composition root (wires use-cases from a repo bundle)
  index.ts         process entrypoint
```

The **domain layer has zero dependencies** on Fastify or Postgres, so the
evaluation logic is unit-tested in isolation. Use-cases depend only on
repository **interfaces** (`application/ports.ts`); integration tests inject
in-memory implementations, production injects Postgres ones.

### Evaluation priority (high → low)

Implemented as an explicit ordered pipeline in [`domain/evaluator.ts`](src/domain/evaluator.ts) — the first guard that decides wins:

1. **Global policy deny** → `blocked_by_global_policy` (a policy with `channel = null` is a wildcard over all channels). Beats everything, including an explicit user opt-in.
2. **Quiet hours** → `blocked_by_quiet_hours`, *unless* the type is transactional. Transactional types are identified by the domain predicate `isTransactional()` (`transactional_*`), not by ad-hoc string checks at call sites.
3. **User opt-out** → `blocked_by_user_preference`.
4. **User opt-in** → `allowed_by_user_preference`.
5. **Default** → `allowed_by_default`, or `blocked_by_user_preference` when the default is off (no consent for a marketing type).

### Timezones & quiet hours

`datetime` arrives as a UTC ISO-8601 instant. It is converted to the user's
timezone via luxon, then compared against the `HH:mm` window. Windows that wrap
past midnight (e.g. `22:00–08:00`) are handled (`start >= end` ⇒ inside if
`now >= start || now < end`). The window is half-open `[start, end)`.

### Idempotency

`POST /users/:id/preferences` upserts overrides keyed by
`(user_id, notification_type, channel)` (a primary key) and quiet hours keyed by
`user_id`. There is no append-only log, so repeating the same request yields the
same final state and the same row count. Verified by scenario-5 test.

### New-user behaviour

Unknown users are **lazily created with defaults** on first `GET` or `evaluate`
(no default rows are written — defaults are computed). Chosen over `404` so the
evaluate path never fails for a brand-new user. `GET` returns the *effective*
grid (defaults + overrides, each tagged with its `source`).

## API

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/users/:id/preferences` | – | effective settings + quiet hours |
| POST | `/users/:id/preferences` | `{ updates: [...], quietHours?: {...}\|null }` | updated effective settings |
| POST | `/evaluate` | `{ userId, notificationType, channel, region, datetime }` | `{ decision, reason }` |
| POST | `/policies` | `{ notificationType, channel?\|null, region }` | created policy |
| GET | `/health` | – | `{ status: "ok" }` |

`quietHours` semantics on update: omitted = leave unchanged, `null` = clear, object = set.

### Examples

```bash
# Evaluate (matches the spec sample)
curl -s localhost:3000/evaluate -H 'content-type: application/json' -d '{
  "userId":"user-1","notificationType":"marketing_sms","channel":"sms",
  "region":"EU","datetime":"2026-05-21T21:30:00Z"
}'
# => {"decision":"deny","reason":"blocked_by_global_policy"}

# Update preferences (idempotent)
curl -s -XPOST localhost:3000/users/user-1/preferences -H 'content-type: application/json' -d '{
  "updates":[{"notificationType":"marketing_email","channel":"email","enabled":false}],
  "quietHours":{"start":"22:00","end":"08:00","timezone":"Europe/Moscow"}
}'
```

## Running it

### With Docker (one command)

```bash
docker compose up --build
```

This starts Postgres, runs migrations, seeds demo data (`user-1`, `user-2`, and
the `marketing_sms`-in-`EU` policy), then serves on `http://localhost:3000`.

### Without Docker

The service reads configuration from environment variables (no auto-loaded `.env`
file — in production you'd use real env vars or a secrets manager). Pass them
inline or export them first.

```bash
# 1. Start a local Postgres (Docker-less option — requires brew on macOS)
brew install postgresql@16 && brew services start postgresql@16
createdb notifications

# 2. Install dependencies
npm install

# 3. Run migrations and (optional) seed
DATABASE_URL=postgres://<user>@localhost:5432/notifications npm run migrate
DATABASE_URL=postgres://<user>@localhost:5432/notifications npm run seed

# 4. Start the server
DATABASE_URL=postgres://<user>@localhost:5432/notifications npm run dev
# or build first: npm run build && DATABASE_URL=... npm start
```

Replace `<user>` with your OS username (e.g. `john`). The default URL in
`docker-compose.yml` uses `postgres:postgres` credentials, which Postgres
created by Docker Compose provides out of the box. For a brew-installed
Postgres, the superuser matches your OS username and needs no password on a
local socket.

> **Tip:** `docker compose up -d postgres` is the quickest way to get a
> compatible Postgres without installing anything locally:
> ```bash
> docker compose up -d postgres
> npm install
> DATABASE_URL=postgres://postgres:postgres@localhost:5432/notifications npm run migrate
> DATABASE_URL=postgres://postgres:postgres@localhost:5432/notifications npm run seed
> DATABASE_URL=postgres://postgres:postgres@localhost:5432/notifications npm run dev
> ```

### Tests

```bash
npm test          # domain unit tests + in-memory HTTP integration tests
npm run typecheck # strict tsc, no emit
```

Covered scenarios: defaults for new users, opt-out reflected in GET,
timezone/midnight-wrap quiet hours (block marketing_push, allow transactional_push),
global policy denial, idempotency (row-count assertion), and the
policy-beats-opt-in priority edge case.

## Database schema

- `users(id, created_at)`
- `user_notification_preferences(user_id, notification_type, channel, enabled, updated_at)` — PK `(user_id, notification_type, channel)` enables idempotent upsert.
- `user_quiet_hours(user_id PK, start_time, end_time, timezone, updated_at)`
- `global_policies(id, notification_type, channel NULL, region, created_at)` — unique on `(notification_type, COALESCE(channel,'*'), region)`.

## Observability

- Structured JSON logs for `user_preferences_updated` (what changed + userId) and `evaluate_decision` (userId, type, channel, decision, reason, latency).
- `Metrics` port (`infrastructure/logger.ts`) with documented metrics to wire in prod: `evaluate.latency_ms` (timer), `evaluate.decision` (counter by decision/reason), `preferences.update`, `repository.query_ms`. The backend is a logging stub by design.

## What I'd add for production

- Caching of resolved preferences/policies with event-driven invalidation.
- Rate limiting on `/evaluate`; batch-evaluate endpoint.
- Audit log / versioning for global-policy and preference changes.
- RBAC for the policy-management endpoints.
- Real metrics + distributed tracing (OpenTelemetry).
- Migration tooling with down-migrations; connection-pool tuning.
