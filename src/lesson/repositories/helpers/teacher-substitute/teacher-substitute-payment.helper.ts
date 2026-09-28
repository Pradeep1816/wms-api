import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import { Lesson } from '../../../entities/lesson.entity';
import { LessonPayment } from '../../../entities/lesson-payment.entity';
import { Payment } from '../../../../payment/entities/payment.entity';
import { CreditUsage } from '../../../../payment/entities/credit-usage.entity';
import { LessonConfirmationService } from '../../../services/lesson-confirmation.service';

@Injectable()
export class TeacherSubstitutePaymentHelper {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(CreditUsage)
    private readonly creditUsageRepository: Repository<CreditUsage>,
    private readonly lessonConfirmationService: LessonConfirmationService,
  ) {}

  /**
   * Transfer lesson payments from old lesson to new lesson.
   * Must be called with manager so all DB access runs in the same transaction.
   * Legacy: foreach ($oldLesson->lessonPayments as $lessonPayment) {
   *   $lessonPayment->lessonId = $newLesson->id;
   *   if ($lessonPayment->payment->creditUsage) {
   *     $lessonPayment->payment->creditUsage->debitUsagePayment->updateAttributes(['reference' => $rescheduledLesson->lessonNumber]);
   *   }
   * }
   * 
   * Also updates customer balance (legacy: LessonPayment::afterSave() → updateCustomerBalance()).
   */
  async transferLessonPayments(
    oldLessonId: number,
    newLessonId: number,
    manager: EntityManager,
  ): Promise<void> {
    const paymentRepo = manager.getRepository(LessonPayment);
    const paymentEntityRepo = manager.getRepository(Payment);
    const lessonRepo = manager.getRepository(Lesson);
    const creditUsageRepo = manager.getRepository(CreditUsage);

    const lessonPayments = await paymentRepo.find({
      where: {
        lessonId: oldLessonId,
        isDeleted: 0, // Entity defines isDeleted as number, so 0 is correct
      },
      relations: ['payment'],
    });

    const newLesson = await lessonRepo.findOne({
      where: { id: newLessonId },
    });

    if (!newLesson) {
      throw new Error(`New lesson ${newLessonId} not found`);
    }

    const paymentIds = lessonPayments
      .map((lp) => lp.payment?.id)
      .filter((id): id is number => id != null);

    let creditUsages: CreditUsage[] = [];
    if (paymentIds.length > 0) {
      creditUsages = await creditUsageRepo.find({
        where: { creditPaymentId: In(paymentIds) },
      });
    }

    const creditByPaymentId = new Map(
      creditUsages.map((cu) => [cu.creditPaymentId, cu]),
    );
    const debitPaymentIds = [
      ...new Set(creditUsages.map((cu) => cu.debitPaymentId).filter(Boolean)),
    ];
    let debitPayments: Payment[] = [];
    if (debitPaymentIds.length > 0) {
      debitPayments = await paymentEntityRepo.find({
        where: { id: In(debitPaymentIds) },
      });
    }
    const debitById = new Map(debitPayments.map((p) => [p.id, p]));

    const newLessonRef = newLesson.id.toString();

    for (const lessonPayment of lessonPayments) {
      lessonPayment.lessonId = newLessonId;
      await paymentRepo.save(lessonPayment);

      if (lessonPayment.payment?.id) {
        const creditUsage = creditByPaymentId.get(lessonPayment.payment.id);
        if (creditUsage?.debitPaymentId) {
          const debitPayment = debitById.get(creditUsage.debitPaymentId);
          if (debitPayment) {
            debitPayment.reference = newLessonRef;
            await paymentEntityRepo.save(debitPayment);
            debitById.delete(creditUsage.debitPaymentId);
          }
        }
      }
    }

    // Legacy: LessonPayment::afterSave() → $this->lesson->customer->updateCustomerBalance()
    // Update customer balance for private lessons after payment transfer
    const lessonWithCourse = await lessonRepo.findOne({
      where: { id: newLessonId },
      relations: ['course', 'course.program'],
    });

    if (Number(lessonWithCourse?.course?.program?.type) === 1) { // TYPE_PRIVATE_PROGRAM = 1
      const customerId = await this.getCustomerIdByLessonId(newLessonId, manager);
      if (customerId) {
        await this.lessonConfirmationService.updateCustomerBalance(customerId);
      }
    }
  }

  /**
   * Get customer ID from a lesson via enrolment → student → customer.
   * Used for updating customer balance after payment transfer.
   */
  private async getCustomerIdByLessonId(
    lessonId: number,
    manager: EntityManager,
  ): Promise<number | null> {
    const result = await manager
      .createQueryBuilder()
      .select('student.customer_id', 'customerId')
      .from('lesson', 'lesson')
      .innerJoin('enrolment', 'enrolment', 'enrolment.courseId = lesson.courseId')
      .innerJoin('student', 'student', 'student.id = enrolment.studentId')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('enrolment.isDeleted = 0')
      .andWhere('enrolment.isConfirmed = 1')
      .getRawOne();

    return result ? Number(result.customerId) : null;
  }
}
