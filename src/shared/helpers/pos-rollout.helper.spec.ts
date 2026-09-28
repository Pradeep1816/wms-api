import { describe, expect, it } from 'vitest';
import { isPOSFeatureEnabled } from './pos-rollout.helper';

describe('isPOSFeatureEnabled', () => {
  it.each(['development', 'test', undefined])(
    'enables every location outside production when NODE_ENV is %s',
    (environment) => {
      expect(isPOSFeatureEnabled('woodbridge', environment)).toBe(true);
    },
  );

  it.each(['training-location', 'burlington', ' BURLINGTON '])(
    'enables the production POS pilot for %s',
    (locationSlug) => {
      expect(isPOSFeatureEnabled(locationSlug, 'production')).toBe(true);
    },
  );

  it.each(['woodbridge', '', null, undefined])(
    'disables production POS behavior for %s',
    (locationSlug) => {
      expect(isPOSFeatureEnabled(locationSlug, 'production')).toBe(false);
    },
  );
});
