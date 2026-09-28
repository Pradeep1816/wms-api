/**
 * The customer- and instructor-safe name for a program.
 *
 * Deliberately a pure function rather than only a service method. It has to be
 * callable from transformation services scattered across the teacher, invoice,
 * enrolment and lesson modules, and several of those are constructed
 * positionally in their specs - adding a constructor dependency to each one
 * silently shifts every existing argument. Importing a function costs nothing
 * and cannot break a spec.
 *
 * `ProgramPresentationService` delegates here so there is still one behaviour.
 *
 * What this strips are **markers**, not tiers. The `x` prefix identifies the
 * previous pricing structure across 32 active programs, and the underscore or
 * slash prefix identifies an interim September 2026 program. A tier never
 * appears in a program name, because the tier is held on the enrolment.
 *
 * ## It is gated by location, from 2026-08-18
 *
 * Pass `locationId` and the correction only applies where the September
 * rollout is live. Omit it and every location gets the corrected name, which
 * is what happens in specs and anywhere the location genuinely is not known.
 */
export interface ProgramNameFields {
  name?: string | null;
  publicName?: string | null;
}

/**
 * A marker prefix on an internal program name.
 *
 * `xPiano Core` and `_Flute` are markers; `Xylophone` is an instrument. Hence
 * the capital after the `x` rather than a bare `/^x/i` - Arcadia has no
 * x-instrument today, but "the next program someone adds silently keeps the
 * old rate" is not a failure anyone would think to look for.
 *
 * Exported because the same rule now decides two different things - which name
 * a customer sees, and whether a program may be quoted a September tier - and
 * those must not be allowed to drift apart.
 */
export const INTERNAL_NAME_MARKER = /^(x[A-Z]|[_/])/;

/** Whether an internal name carries a marker that must never be shown. */
export function hasInternalNameMarker(name?: string | null): boolean {
  return INTERNAL_NAME_MARKER.test((name ?? '').trim());
}

/**
 * Locations the corrected name is shown at, or `null` for "everywhere".
 *
 * Held as module state rather than injected because `publicProgramName` is a
 * pure function on purpose - see the note at the top of this file. Populated
 * once at boot by `PricingRolloutService.onModuleInit`, from the pilot slugs,
 * so it can never drift from the rollout list and never depends on a location
 * id being the same number in two environments.
 *
 * `null` means the gate is off and every location gets the corrected name,
 * which is the behaviour outside production and the behaviour in any spec that
 * never boots the module.
 */
let publicNameLocationIds: Set<number> | null = null;

/**
 * Restrict the corrected name to these locations. Called at boot.
 *
 * Passing `null` turns the gate off.
 */
export function setPublicNameLocations(locationIds: number[] | null): void {
  publicNameLocationIds = locationIds === null ? null : new Set(locationIds);
}

/** For tests, and for anyone wondering what the gate currently holds. */
export function getPublicNameLocations(): number[] | null {
  return publicNameLocationIds === null ? null : [...publicNameLocationIds];
}

export function publicProgramName(
  program: ProgramNameFields | null | undefined,
  locationId?: number | null,
): string | null {
  if (!program) {
    return null;
  }

  // Outside the rollout, keep the internal name exactly as it is today.
  //
  // Arcadia was told the pilot locations are the only ones that see any change
  // from this work, and an invoice at Bolton silently changing wording is a
  // change. 217 active enrolments across seven non-pilot locations are on a
  // marker program, so this is not a rounding error.
  //
  // Note the direction of the default: a call site that forgets to pass a
  // location falls through to the corrected name. That is the safer way round
  // - the failure is "a customer at Bolton stops seeing an x", not "a customer
  // at Burlington starts seeing one", and the second is the defect this whole
  // helper exists to prevent.
  if (
    locationId !== undefined &&
    locationId !== null &&
    publicNameLocationIds !== null &&
    !publicNameLocationIds.has(locationId)
  ) {
    return program.name?.trim() || null;
  }

  const explicit = program.publicName?.trim();
  if (explicit) {
    return explicit;
  }

  const internal = program.name?.trim();
  if (!internal) {
    return null;
  }

  // Only strip a marker that is genuinely a prefix rather than the first letter
  // of a real word - `xPiano Core` and `_Flute` yes, `Xylophone` no.
  if (hasInternalNameMarker(internal)) {
    return internal.slice(1).trim();
  }

  return internal;
}
