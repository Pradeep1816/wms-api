import { Injectable } from '@nestjs/common';
import { EditClassroomRepository } from '../../repositories/private-lesson-actions/edit-classroom.repository';
import { EditDurationRepository } from '../../repositories/private-lesson-actions/edit-duration.repository';
import { CustomerBalanceRecalculatorService } from '../../../shared/services/customer-balance-recalculator.service';

export interface EditDurationResult {
  status: boolean;
  message?: string;
  errors?: string[];
}

/**
 * Orchestrates "Edit Duration" from private lesson listing.
 */
@Injectable()
export class EditDurationService {
  constructor(
    private readonly editClassroomRepository: EditClassroomRepository,
    private readonly editDurationRepository: EditDurationRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
  ) {}

  /**
   * Bulk edit duration for selected private lessons.
   * - If any selected lesson is invoiced, block the entire operation.
   * - Validate all selected lessons exist.
   */
  async editDuration(
    _locationId: number,
    userId: number,
    lessonIds: number[],
    duration: string,
    locationSlug: string,
  ): Promise<EditDurationResult> {
    if (!lessonIds?.length) {
      return { status: false, errors: ['At least one lessonId is required'] };
    }

    // Reuse shared invoice-detection query logic used by other private-lesson actions.
    const invoiced = await this.editClassroomRepository.getInvoicedLessonIds(lessonIds);
    if (invoiced.length > 0) {
      return {
        status: false,
        errors: [
          "One of the chosen lesson is invoiced. You can't edit duration for this lessons",
        ],
      };
    }

    // Ensure all selected IDs are valid before attempting write operations.
    const lessons = await this.editClassroomRepository.getLessonsByIds(lessonIds);
    if (lessons.length !== lessonIds.length) {
      return { status: false, errors: ['One or more lessons not found.'] };
    }

    // Normalize duration to HH:mm:ss for DB (accepts HH:mm or HH:mm:ss)
    const normalizedDuration = this.normalizeDuration(duration);

    // Repository executes transactional write path and returns impacted customers.
    const affectedCustomerIds = await this.editDurationRepository.updateDurationForLessons(
      lessonIds,
      normalizedDuration,
    );

    // Keep customer account balances aligned with updated private lesson balances.
    for (const customerId of affectedCustomerIds) {
      if (Number.isFinite(customerId) && customerId > 0) {
        await this.customerBalanceRecalculatorService.recalculateAndPersist(
          customerId,
          { locationSlug },
        );
      }
    }

    return {
      status: true,
      message: 'Lesson Duration Edited Sucessfully',
    };
  }

  /** Normalize duration to HH:mm:ss (e.g. 1:30 → 01:30:00, 1:30:00 → 01:30:00). */
  private normalizeDuration(duration: string): string {
    const parts = duration.trim().split(':');
    const h = parts[0]?.padStart(2, '0') ?? '00';
    const m = parts[1]?.padStart(2, '0') ?? '00';
    const s = parts.length >= 3 ? (parts[2] ?? '00').padStart(2, '0') : '00';
    return `${h}:${m}:${s}`;
  }
}
