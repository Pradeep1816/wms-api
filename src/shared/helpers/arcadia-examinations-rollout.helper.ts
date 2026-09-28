import { isProd } from '../../utils/env';

const PRODUCTION_ARCADIA_EXAMINATION_LOCATIONS = new Set(['training-location']);

/**
 * Returns whether Arcadia Examinations is available for a location.
 *
 * Non-production environments expose every valid location so the complete
 * location matrix can be tested. Production remains restricted to Training
 * Location until the rollout allowlist is deliberately expanded.
 *
 * Future Arcadia controllers/services must enforce this policy server-side;
 * the matching smw-web helper only controls the user experience.
 */
export const isArcadiaExaminationsEnabled = (
  location: string | null | undefined,
): boolean => {
  const normalizedLocation = location?.trim().toLowerCase();
  if (!normalizedLocation) {
    return false;
  }

  if (!isProd()) {
    return true;
  }

  return PRODUCTION_ARCADIA_EXAMINATION_LOCATIONS.has(normalizedLocation);
};
