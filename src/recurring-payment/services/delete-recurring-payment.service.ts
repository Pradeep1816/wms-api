import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DeleteRecurringPaymentRepository } from '../repositories/delete-recurring-payment.repository';

@Injectable()
export class DeleteRecurringPaymentService {
  constructor(
    private readonly deleteRecurringPaymentRepository: DeleteRecurringPaymentRepository,
  ) {}

  /**
   * Delete a recurring payment with detailed result
   * Returns counts of affected records for auditing/monitoring
   * 
   * @param id - Recurring payment ID
   * @param userId - ID of the user performing the delete
   * @returns Detailed delete result
   */
  async delete(
    id: number,
    userId: number,
  ): Promise<any> {
    // Verify the recurring payment exists
    const recurringPayment = await this.deleteRecurringPaymentRepository.findById(id);

    if (!recurringPayment) {
      throw new NotFoundException(`Recurring payment not found: ${id}`);
    }

    // Execute soft delete
    const result = await this.deleteRecurringPaymentRepository.executeSoftDelete(id, userId);

    return {
        recurringPaymentId: id,
        enrolmentsDeleted: result.enrolmentsDeleted,
    };
  }
}
