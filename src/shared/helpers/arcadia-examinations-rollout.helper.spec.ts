import { afterEach, describe, expect, it } from 'vitest';
import { isArcadiaExaminationsEnabled } from './arcadia-examinations-rollout.helper';

describe('isArcadiaExaminationsEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  const setNodeEnv = (environment: string | undefined) => {
    if (environment === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = environment;
  };

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
  });

  it.each(['dev', 'development', 'test', 'staging', undefined])(
    'enables every valid location outside production when environment is %s',
    (environment) => {
      setNodeEnv(environment);

      expect(isArcadiaExaminationsEnabled('training-location')).toBe(true);
      expect(isArcadiaExaminationsEnabled('burlington')).toBe(true);
      expect(isArcadiaExaminationsEnabled('woodbridge')).toBe(true);
    },
  );

  it.each(['prod', 'production'])(
    'enables only Training Location when environment is %s',
    (environment) => {
      setNodeEnv(environment);

      expect(isArcadiaExaminationsEnabled('training-location')).toBe(true);
      expect(isArcadiaExaminationsEnabled('burlington')).toBe(false);
      expect(isArcadiaExaminationsEnabled('woodbridge')).toBe(false);
    },
  );

  it('normalizes location values', () => {
    setNodeEnv('production');

    expect(isArcadiaExaminationsEnabled('  TRAINING-LOCATION  ')).toBe(true);
  });

  it.each([undefined, null, '', '   '])(
    'rejects a missing location in every environment',
    (location) => {
      setNodeEnv('development');
      expect(isArcadiaExaminationsEnabled(location)).toBe(false);

      setNodeEnv('production');
      expect(isArcadiaExaminationsEnabled(location)).toBe(false);
    },
  );
});
