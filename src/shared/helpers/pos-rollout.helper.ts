const PRODUCTION_POS_LOCATIONS = new Set(['training-location', 'burlington']);

/**
 * Gates the SMW-native POS pilot and server-side behavior derived from it.
 * Non-production environments expose POS for every location; production is
 * restricted to Training Location and Burlington during the pilot.
 */
export const isPOSFeatureEnabled = (
  locationSlug?: string | null,
  environment = process.env.NODE_ENV,
): boolean => {
  if (environment !== 'production') {
    return true;
  }

  const normalizedLocation = locationSlug?.trim().toLowerCase();
  return normalizedLocation
    ? PRODUCTION_POS_LOCATIONS.has(normalizedLocation)
    : false;
};
