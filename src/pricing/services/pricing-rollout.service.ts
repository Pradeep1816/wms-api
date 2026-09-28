import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { isProd } from 'src/utils/env';
import { setPublicNameLocations } from '../utils/program-public-name';

/**
 * The two locations the September 2026 structure piloted at.
 *
 * **No longer consulted.** The structure is now live for every location - see
 * `isEnabledForLocation` below. Kept because it records who piloted it, and
 * because re-gating is a one-line change if a location ever has to be pulled
 * back.
 *
 * Training is the internal test school and Burlington is the pilot Ashif
 * offered on the 2026-08-04 call. Note this was the opposite of decision D19,
 * and not a contradiction of it: D19 excluded Training from the automated
 * *conversion* of existing enrolments - nobody wanted test data re-priced -
 * while this gate was about where staff may choose a tier on a *new* enrolment.
 */
export const SEPTEMBER_2026_ROLLOUT_LOCATION_SLUGS = [
  'training-location',
  'burlington',
];

/**
 * Is the September 2026 tier structure live for this location?
 *
 * **Yes, everywhere, in every environment**, since the full rollout. Arcadia
 * piloted at Training and Burlington through August 2026 and signed the
 * structure off for the whole estate.
 *
 * This gate is the single point every pricing path passes through - the tier
 * selector's options endpoint, enrolment creation, the pricing-basis change,
 * catalogue rate resolution, digital enrolment and the adoption report all ask
 * it - so opening it here opens all of them, and closing it here closes all of
 * them again.
 *
 * ## Why it stays a method rather than being deleted
 *
 * Two reasons. It is the kill switch: putting a location back behind the pilot
 * is one line here rather than an edit to eight call sites. And the call sites
 * are all `await`ed already, so leaving the shape alone keeps this change to
 * what it is - a policy change, not a refactor of the pricing paths a week
 * before September.
 *
 * ## Why it was enforced in the API and not only in the UI
 *
 * Worth keeping on the record for whoever re-gates it. Hiding the selector
 * stops staff choosing a tier; it does not stop a tier arriving. `POST` bodies
 * are editable, the digital enrolment path builds its own payload, and
 * auto-renewal runs with no UI at all. A tier accepted at a location that is
 * not live would write a September catalogue rate into `course_program_rate`
 * and bill it - silently, and for the life of the enrolment.
 */
@Injectable()
export class PricingRolloutService implements OnModuleInit {
  private readonly logger = new Logger(PricingRolloutService.name);

  /**
   * Slug lookups are cached for the process lifetime. A location's slug is not
   * something that changes while the API is running, and the resolver is on
   * the enrolment-creation path.
   */
  private readonly slugCache = new Map<number, string | null>();

  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  /**
   * Show the corrected public program name at every location.
   *
   * `publicProgramName` strips the internal `x` and `_` markers before a name
   * reaches a customer. That used to be limited to the pilot locations so the
   * two rollouts moved together; with the structure live estate-wide there is
   * nothing left to hold it back, and no location should be showing a customer
   * a name like `xPiano Core`.
   *
   * `null` is the "no restriction" value the helper already understood, so this
   * needs no change there - and it removes the boot-time location query
   * entirely, along with the failure path that query needed.
   */
  onModuleInit(): void {
    setPublicNameLocations(null);
    this.logger.log(
      'September 2026 pricing is live for every location; ' +
        'corrected program names shown everywhere',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isEnabledForLocation(locationId: number): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Deliberately the shared helper, not a bare `NODE_ENV === 'production'`.
   *
   * The deployment workflows set **`NODE_ENV=prod`** in production and
   * **`NODE_ENV=dev`** in dev - never the long spellings. A literal comparison
   * against `'production'` is therefore false in production, which would leave
   * this gate permanently open and roll the September pricing out to every
   * location on the first prod deploy instead of the two pilot schools.
   *
   * `isProd()` accepts both spellings, and is what the cron services already
   * use.
   */
  private isProduction(): boolean {
    return isProd();
  }

  /*
   * `isProduction` and `slugFor` below are deliberately retained though nothing
   * calls them today.
   *
   * They are the whole of the re-gating path: putting a location back behind a
   * pilot means restoring three lines to `isEnabledForLocation` and nothing
   * else. Deleting them would turn a one-line revert into a rewrite, on the one
   * change anyone would want to make in a hurry.
   */

  private async slugFor(locationId: number): Promise<string | null> {
    const cached = this.slugCache.get(locationId);
    if (cached !== undefined) {
      return cached;
    }

    const location = await this.locationRepository.findOne({
      where: { id: locationId },
      select: { id: true, slug: true },
    });

    // Normalised the same way the web helper normalises it, so a slug that
    // differs only by case or padding cannot enable one side and not the other.
    const slug = location?.slug ? location.slug.trim().toLowerCase() : null;
    this.slugCache.set(locationId, slug);
    return slug;
  }
}
