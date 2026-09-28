import { Injectable } from '@nestjs/common';
import { Program } from '../../program/entities/program.entity';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';
import {
  hasInternalNameMarker,
  publicProgramName,
} from '../utils/program-public-name';

/**
 * The one place that decides what a program is called in front of a customer
 * or an instructor, and which half of the tuition matrix it belongs to.
 *
 * Two problems this exists for:
 *
 *  1. Internal names carry markers. The `x` prefix identifies the previous
 *     pricing structure, and the underscore prefix identifies an interim
 *     September 2026 program created while the permanent structure was being
 *     built. Neither belongs on an invoice, a receipt, a schedule, an
 *     Instructor Time Voucher or an Invoiced Lessons document.
 *
 *  2. Pricing category cannot be inferred from the rate. Vocal programs sit at
 *     $72.50 an hour against $65.00 for standard, which looks like a clean
 *     signal until you notice `Harmonium` is also $72.50 and is an instrument.
 *     Deriving from rate would put those students on Vocal Tier 1 at $160
 *     instead of Standard Tier 1 at $145 - an over-charge reaching a parent.
 *
 * Note on tiers: a tier never appears in a program name under the current
 * design, because the tier is held on the enrolment rather than the program.
 * That is what keeps `Piano Core` a single program instead of three, and it is
 * why this service is about markers and categories rather than hiding tiers.
 */
@Injectable()
export class ProgramPresentationService {
  /**
   * The name to show a customer or an instructor.
   *
   * Falls back to stripping a marker from the internal name when `publicName`
   * has not been set, so a program created before the column existed still
   * cannot leak an `x` or `_` prefix.
   */
  publicNameFor(program: Pick<Program, 'name' | 'publicName'>): string {
    return publicProgramName(program) ?? '';
  }

  /**
   * True when the internal name carries a marker that must not be shown.
   *
   * Delegates to the shared rule rather than carrying its own. This used to
   * test `/^[x_/]/i`, which is looser than the rule the display path applies
   * and would have called `Xylophone` a marker. Harmless while it only chose a
   * label; not harmless now that `isTierable` reads it, where it would have
   * meant a genuine x-instrument quietly keeping the old rate for good.
   */
  hasInternalMarker(program: Pick<Program, 'name'>): boolean {
    return hasInternalNameMarker(program.name);
  }

  /**
   * Pricing category for the program.
   *
   * Fails closed. An unclassified program means migration has not looked at it
   * yet, and guessing would put a student on the wrong half of the matrix.
   */
  pricingCategoryFor(
    program: Pick<Program, 'id' | 'name' | 'pricingCategory'>,
  ): PricingCategoryEnum {
    const category = program.pricingCategory?.trim().toLowerCase();

    if (
      category === PricingCategoryEnum.STANDARD ||
      category === PricingCategoryEnum.VOCAL
    ) {
      return category;
    }

    throw new PricingResolutionError(
      PricingResolutionErrorCode.INVALID_INPUT,
      `Program ${program.id} has no pricing category, so no tuition can be resolved for it`,
      { programId: program.id, programName: program.name },
    );
  }

  /** Whether a category has been set at all, without throwing. */
  isClassified(program: Pick<Program, 'pricingCategory'>): boolean {
    const category = program.pricingCategory?.trim().toLowerCase();
    return (
      category === PricingCategoryEnum.STANDARD ||
      category === PricingCategoryEnum.VOCAL
    );
  }

  /**
   * Whether a September tier may be quoted for this program.
   *
   * Classification alone is not enough, and this is the difference that
   * matters. A marker-prefixed program is a **frozen copy of an older price
   * sheet** - `xPiano Core` exists precisely to hold the 2018 rate of $57.50
   * an hour while `Piano Core` moved to $65.00. All 32 of them are classified,
   * because classification describes which half of the matrix an instrument
   * belongs to, not which sheet it is priced from.
   *
   * So `isClassified` alone would offer tiers on them, and a student sitting
   * on `xPiano Core` specifically to keep the 2018 price could be quoted the
   * September one - $145.00 a month against the $115.00 that program exists to
   * preserve. The program whose whole purpose is "old price" would start
   * charging the newest.
   *
   * They are not dormant, either: 39 enrolments were started on them during
   * 2026, seven of them in July. Excluding them freezes that generation where
   * it is instead of letting it grow a third layer.
   *
   * Note what this does **not** do. It does not hide the program, block an
   * enrolment, or change any existing price. A marker program simply keeps the
   * rate it already carries, which is the behaviour every location had before
   * tiering existed.
   */
  isTierable(program: Pick<Program, 'name' | 'pricingCategory'>): boolean {
    return this.isClassified(program) && !this.hasInternalMarker(program);
  }
}
