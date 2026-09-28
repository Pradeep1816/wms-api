import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { CustomerRecurringPaymentEnrolment } from '../entities/customer-recurring-payment-enrolment.entity';

/**
 * Repository for delete recurring payment operations
 * Handles soft delete functionality with transaction support
 */
@Injectable()
export class DeleteRecurringPaymentRepository {
  constructor(
    @InjectRepository(CustomerRecurringPayment)
    private readonly customerRecurringPaymentRepository: Repository<CustomerRecurringPayment>,
    @InjectRepository(CustomerRecurringPaymentEnrolment)
    private readonly customerRecurringPaymentEnrolmentRepository: Repository<CustomerRecurringPaymentEnrolment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find recurring payment by ID (only non-deleted records)
   */
  async findById(id: number): Promise<CustomerRecurringPayment | null> {
    return this.customerRecurringPaymentRepository.findOne({
      where: { id, isDeleted: false },
    });
  }

  /**
   * Soft delete all recurring payment enrolments for a given recurring payment ID
   * This is called before soft deleting the parent recurring payment
   */
  async softDeleteEnrolments(
    customerRecurringPaymentId: number,
    updatedByUserId: number,
  ): Promise<number> {
    const result = await this.customerRecurringPaymentEnrolmentRepository
      .createQueryBuilder()
      .update()
      .set({
        isDeleted: true,
        updatedByUserId,
      })
      .where('customerRecurringPaymentId = :customerRecurringPaymentId', { customerRecurringPaymentId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: false })
      .execute();

    return result.affected || 0;
  }

  /**
   * Soft delete a recurring payment by ID
   */
  async softDelete(
    id: number,
    updatedByUserId: number,
  ): Promise<boolean> {
    const result = await this.customerRecurringPaymentRepository
      .createQueryBuilder()
      .update()
      .set({
        isDeleted: true,
        updatedByUserId,
      })
      .where('id = :id', { id })
      .andWhere('isDeleted = :isDeleted', { isDeleted: false })
      .execute();

    return (result.affected || 0) > 0;
  }

  /**
   * Execute soft delete in a transaction
   * Deletes child enrolments first, then the parent recurring payment
   * 
   * @param id - Recurring payment ID
   * @param updatedByUserId - User performing the delete
   * @returns Object with counts of affected records
   */
  async executeSoftDelete(
    id: number,
    updatedByUserId: number,
  ): Promise<{ enrolmentsDeleted: number; paymentDeleted: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = {
        ...(queryRunner.data ?? {}),
        currentUserId: updatedByUserId,
      };

      // Load and save entities so the audit subscriber receives their previous
      // state. Keep the legacy child-first soft-delete order.
      const enrolments = await queryRunner.manager.find(
        CustomerRecurringPaymentEnrolment,
        {
          where: {
            customerRecurringPaymentId: id,
            isDeleted: false,
          },
        },
      );

      for (const enrolment of enrolments) {
        enrolment.isDeleted = true;
        enrolment.updatedByUserId = updatedByUserId;
      }

      if (enrolments.length > 0) {
        await queryRunner.manager.save(
          CustomerRecurringPaymentEnrolment,
          enrolments,
        );
      }

      const payment = await queryRunner.manager.findOne(
        CustomerRecurringPayment,
        {
          where: { id, isDeleted: false },
        },
      );

      if (payment) {
        payment.isDeleted = true;
        payment.updatedByUserId = updatedByUserId;
        await queryRunner.manager.save(CustomerRecurringPayment, payment);
      }

      await queryRunner.commitTransaction();

      return {
        enrolmentsDeleted: enrolments.length,
        paymentDeleted: Boolean(payment),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
