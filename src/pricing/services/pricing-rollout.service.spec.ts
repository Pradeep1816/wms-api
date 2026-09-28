import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingRolloutService } from './pricing-rollout.service';
import { getPublicNameLocations, setPublicNameLocations } from '../utils/program-public-name';

/**
 * The September 2026 structure is live for every location.
 *
 * This file used to pin the opposite - a two-school pilot, matched by slug,
 * enforced only in production. Arcadia signed the structure off for the whole
 * estate after piloting at Training and Burlington through August 2026, so what
 * is worth asserting now is that **nothing** narrows it: not the environment,
 * not the location, not a location that cannot be found.
 *
 * The pilot machinery is still in the service, deliberately, as the re-gating
 * path. These tests are what would fail first if it were ever re-armed by
 * accident.
 */
describe('PricingRolloutService', () => {
  let locationRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let service: PricingRolloutService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    locationRepository = { findOne: vi.fn(), find: vi.fn() };
    service = new PricingRolloutService(locationRepository as never);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    setPublicNameLocations(null);
  });

  describe('is enabled everywhere', () => {
    // Both spellings the deployment workflows actually set. `api-prod.yml`
    // writes NODE_ENV=prod and `api-dev.yml` writes NODE_ENV=dev; neither
    // writes the long form. They now have to behave identically.
    it.each(['prod', 'production', 'dev', 'development', undefined])(
      'under NODE_ENV=%s',
      async (env) => {
        if (env === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = env;
        }

        await expect(service.isEnabledForLocation(7)).resolves.toBe(true);
      },
    );

    it('for a location that never piloted', async () => {
      process.env.NODE_ENV = 'prod';

      // Woodbridge was outside the pilot and would have been refused before.
      await expect(service.isEnabledForLocation(9)).resolves.toBe(true);
    });

    it('for a location that does not exist', async () => {
      process.env.NODE_ENV = 'prod';

      // Previously this refused rather than assumed. There is nothing left to
      // refuse: every location is on the structure, so an id that resolves to
      // nothing is the caller's problem, not this gate's.
      await expect(service.isEnabledForLocation(999999)).resolves.toBe(true);
    });

    it('without asking the database anything', async () => {
      process.env.NODE_ENV = 'prod';

      await service.isEnabledForLocation(7);
      await service.isEnabledForLocation(9);

      // This sat on the enrolment-creation path and cached slugs to stay off
      // the hot path. With nothing to look up, the query is gone entirely.
      expect(locationRepository.findOne).not.toHaveBeenCalled();
      expect(locationRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('program names at boot', () => {
    it('shows the corrected name at every location', () => {
      process.env.NODE_ENV = 'prod';
      // Start from a restricted gate to prove boot clears it rather than
      // merely leaving it alone.
      setPublicNameLocations([1, 15]);

      service.onModuleInit();

      // `null` is the helper's "no restriction" value. No location should be
      // showing a customer a name like `xPiano Core`.
      expect(getPublicNameLocations()).toBeNull();
    });

    it('asks the database nothing', () => {
      process.env.NODE_ENV = 'prod';

      service.onModuleInit();

      // The boot-time lookup that resolved pilot slugs to ids is gone, and
      // with it the failure path that lookup needed.
      expect(locationRepository.find).not.toHaveBeenCalled();
    });

    it('behaves the same outside production', () => {
      process.env.NODE_ENV = 'development';
      setPublicNameLocations([1]);

      service.onModuleInit();

      expect(getPublicNameLocations()).toBeNull();
      expect(locationRepository.find).not.toHaveBeenCalled();
    });
  });
});
