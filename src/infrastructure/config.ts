/** Centralised, validated runtime configuration. */
export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl =
    env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/notifications';

  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
