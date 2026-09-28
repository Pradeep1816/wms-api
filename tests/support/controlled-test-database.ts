const ERROR_PREFIX = '[DB-backed test DSN rejected]';
const CONTROLLED_DATABASE_NAME = /^smw(?:_[a-z0-9]+)*_test(?:_[a-z0-9]+)?$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PROTECTED_DATABASE_NAMES = new Set([
  'smw',
  'smw_db',
  'smw_full',
  'smw_production',
  'production',
]);
const PRIVILEGED_DATABASE_USERS = new Set(['root', 'admin', 'administrator']);

export interface ControlledTestDatabaseTarget {
  database: string;
  host: string;
  port: string;
  username: string;
}

export function assertControlledTestDatabaseTarget(
  dsn: string,
  environment: NodeJS.ProcessEnv = process.env,
): ControlledTestDatabaseTarget {
  if (environment.TEST_DB_ALLOW_SYNC !== '1') {
    throw rejected(
      'schema synchronization is destructive and must be explicitly allowed. ' +
        'Set TEST_DB_ALLOW_SYNC=1 only for a disposable test schema.',
    );
  }

  if (environment.NODE_ENV !== 'test') {
    throw rejected(
      'NODE_ENV must be test before a DB-backed test may synchronize a schema.',
    );
  }

  const parsed = parseMysqlDsn(dsn);
  const database = decodeComponent(
    parsed.pathname.replace(/^\//, ''),
    'database name',
  );
  const lowerDatabase = database.toLowerCase();
  const host = normalizeHost(parsed.hostname);
  const username = decodeComponent(parsed.username, 'database username');

  if (PROTECTED_DATABASE_NAMES.has(lowerDatabase)) {
    throw rejected(`refusing to synchronize protected database ${database}.`);
  }

  if (!CONTROLLED_DATABASE_NAME.test(lowerDatabase)) {
    throw rejected(
      `database ${database || '(empty)'} does not match the controlled test naming rule. ` +
        'Use a disposable schema such as smw_api_test or smw_arcadia_test_run1.',
    );
  }

  if (!host) {
    throw rejected('the database hostname is required.');
  }

  const allowedHosts = new Set([
    ...LOOPBACK_HOSTS,
    ...splitAllowlist(environment.TEST_DB_ALLOWED_HOSTS),
  ]);
  if (!allowedHosts.has(host)) {
    throw rejected(
      `host ${host} is not loopback or explicitly listed in TEST_DB_ALLOWED_HOSTS.`,
    );
  }

  if (!username) {
    throw rejected('a restricted test database username is required.');
  }

  if (PRIVILEGED_DATABASE_USERS.has(username.toLowerCase())) {
    throw rejected(
      `database user ${username} is privileged; use a restricted test-only database user.`,
    );
  }

  return {
    database,
    host,
    port: parsed.port || '3306',
    username,
  };
}

function parseMysqlDsn(dsn: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    throw rejected('TEST_DB_DSN must be a valid MySQL URL.');
  }

  if (parsed.protocol !== 'mysql:') {
    throw rejected('TEST_DB_DSN must use the mysql protocol.');
  }

  return parsed;
}

function decodeComponent(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw rejected(`TEST_DB_DSN contains an invalid encoded ${label}.`);
  }
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, '');
}

function splitAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((host) => normalizeHost(host.trim()))
    .filter(Boolean);
}

function rejected(reason: string): Error {
  return new Error(`${ERROR_PREFIX}: ${reason}`);
}
