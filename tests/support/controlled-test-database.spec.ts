import { describe, expect, it } from 'vitest';
import { assertControlledTestDatabaseTarget } from './controlled-test-database.js';

const SAFE_ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  TEST_DB_ALLOW_SYNC: '1',
};

describe('controlled test database target', () => {
  it('accepts a loopback disposable database and returns no password', () => {
    const target = assertControlledTestDatabaseTarget(
      'mysql://smw_test_user:not-evidence@localhost:3307/smw_arcadia_test_run1',
      SAFE_ENVIRONMENT,
    );

    expect(target).toEqual({
      database: 'smw_arcadia_test_run1',
      host: 'localhost',
      port: '3307',
      username: 'smw_test_user',
    });
    expect(target).not.toHaveProperty('password');
  });

  it('requires the destructive synchronization opt-in', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'mysql://smw_test_user:value@localhost/smw_api_test',
        {
          NODE_ENV: 'test',
        },
      ),
    ).toThrow(/TEST_DB_ALLOW_SYNC=1/);
  });

  it('requires the test runtime environment', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'mysql://smw_test_user:value@localhost/smw_api_test',
        {
          NODE_ENV: 'development',
          TEST_DB_ALLOW_SYNC: '1',
        },
      ),
    ).toThrow(/NODE_ENV must be test/);
  });

  it.each(['smw', 'smw_db', 'smw_full', 'smw_production', 'production'])(
    'rejects protected database %s',
    (database) => {
      expect(() =>
        assertControlledTestDatabaseTarget(
          `mysql://smw_test_user:value@localhost/${database}`,
          SAFE_ENVIRONMENT,
        ),
      ).toThrow(/protected database/);
    },
  );

  it.each(['arcadia_test', 'smw_test_backup_old', 'smw-api-test', ''])(
    'rejects database name %j outside the controlled naming rule',
    (database) => {
      expect(() =>
        assertControlledTestDatabaseTarget(
          `mysql://smw_test_user:value@localhost/${database}`,
          SAFE_ENVIRONMENT,
        ),
      ).toThrow(/controlled test naming rule/);
    },
  );

  it('rejects a non-loopback host by default', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'mysql://smw_test_user:value@shared-db.internal/smw_api_test',
        SAFE_ENVIRONMENT,
      ),
    ).toThrow(/not loopback or explicitly listed/);
  });

  it('accepts a non-loopback CI host only when it is explicitly allowlisted', () => {
    const target = assertControlledTestDatabaseTarget(
      'mysql://smw_test_user:value@mysql-ci/smw_api_test',
      {
        ...SAFE_ENVIRONMENT,
        TEST_DB_ALLOWED_HOSTS: 'mysql-ci',
      },
    );

    expect(target.host).toBe('mysql-ci');
  });

  it('accepts the IPv6 loopback host and applies the default MySQL port', () => {
    const target = assertControlledTestDatabaseTarget(
      'mysql://smw_test_user:value@[::1]/smw_api_test',
      SAFE_ENVIRONMENT,
    );

    expect(target.host).toBe('::1');
    expect(target.port).toBe('3306');
  });

  it('rejects a missing hostname', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'mysql:///smw_api_test',
        SAFE_ENVIRONMENT,
      ),
    ).toThrow(/database hostname is required/);
  });

  it('rejects a missing database username', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'mysql://:value@localhost/smw_api_test',
        SAFE_ENVIRONMENT,
      ),
    ).toThrow(/restricted test database username is required/);
  });

  it.each(['root', 'admin', 'administrator'])(
    'rejects privileged database user %s',
    (username) => {
      expect(() =>
        assertControlledTestDatabaseTarget(
          `mysql://${username}:value@localhost/smw_api_test`,
          SAFE_ENVIRONMENT,
        ),
      ).toThrow(/restricted test-only database user/);
    },
  );

  it('rejects non-MySQL URLs', () => {
    expect(() =>
      assertControlledTestDatabaseTarget(
        'postgres://smw_test_user:value@localhost/smw_api_test',
        SAFE_ENVIRONMENT,
      ),
    ).toThrow(/must use the mysql protocol/);
  });

  it('rejects malformed URLs without echoing the supplied value', () => {
    const suppliedValue = 'not-a-dsn-never-echo-this';
    let capturedError: Error | undefined;

    try {
      assertControlledTestDatabaseTarget(suppliedValue, SAFE_ENVIRONMENT);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      capturedError = error;
    }

    expect(capturedError?.message).toContain('must be a valid MySQL URL');
    expect(capturedError?.message).not.toContain(suppliedValue);
  });

  it('does not echo credentials when a DSN is rejected', () => {
    const secretMarker = 'never-echo-this-value';
    let capturedError: Error | undefined;

    try {
      assertControlledTestDatabaseTarget(
        `mysql://smw_test_user:${secretMarker}@shared-db.internal/smw_api_test`,
        SAFE_ENVIRONMENT,
      );
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      capturedError = error;
    }

    expect(capturedError).toBeDefined();
    expect(capturedError?.message).not.toContain(secretMarker);
  });
});
