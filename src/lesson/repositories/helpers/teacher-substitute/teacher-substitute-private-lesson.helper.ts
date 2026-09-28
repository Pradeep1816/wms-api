import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { Lesson } from '../../../entities/lesson.entity';
import { PrivateLesson } from '../../../entities/private-lesson.entity';
import { LessonPayment } from '../../../entities/lesson-payment.entity';
import { PaymentCycleLesson } from '../../../../enrolment/entities/payment-cycle-lesson.entity';
import { LessonSplitUsage } from '../../../entities/lesson-split-usage.entity';
import { LessonHierarchy } from '../../../entities/lesson-hierarchy.entity';
import { Program } from '../../../../program/entities/program.entity';
import { RoundingUtils } from '../../../../utils/rounding.utils';

@Injectable()
export class TeacherSubstitutePrivateLessonHelper {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(PaymentCycleLesson)
    private readonly paymentCycleLessonRepository: Repository<PaymentCycleLesson>,
    @InjectRepository(LessonSplitUsage)
    private readonly lessonSplitUsageRepository: Repository<LessonSplitUsage>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
  ) {}

  private normalizeProgramType(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Check if lesson is private (legacy: $lesson->isPrivate())
   * Legacy: return (int) $this->course->program->type === (int) Program::TYPE_PRIVATE_PROGRAM;
   */
  async isPrivateLesson(lesson: Lesson): Promise<boolean> {
    const relationProgramType = this.normalizeProgramType(
      lesson?.course?.program?.type,
    );
    if (relationProgramType !== null) {
      return relationProgramType === Program.TYPE_PRIVATE_PROGRAM;
    }

    const lessonId = Number(lesson?.id ?? 0);
    if (Number.isFinite(lessonId) && lessonId > 0) {
      const lessonWithRelations = await this.lessonRepository.findOne({
        where: { id: lessonId },
        relations: ['course', 'course.program'],
      });
      const loadedProgramType = this.normalizeProgramType(
        lessonWithRelations?.course?.program?.type,
      );
      if (loadedProgramType !== null) {
        return loadedProgramType === Program.TYPE_PRIVATE_PROGRAM;
      }
    }

    const courseId = Number(lesson?.courseId ?? lesson?.course?.id ?? 0);
    if (Number.isFinite(courseId) && courseId > 0) {
      const rawProgramType = await this.lessonRepository.manager
        .createQueryBuilder()
        .select('program.type', 'programType')
        .from('course', 'course')
        .innerJoin('program', 'program', 'program.id = course.programId')
        .where('course.id = :courseId', { courseId })
        .getRawOne<{ programType: number | string }>();

      const fallbackProgramType = this.normalizeProgramType(
        rawProgramType?.programType,
      );
      if (fallbackProgramType !== null) {
        return fallbackProgramType === Program.TYPE_PRIVATE_PROGRAM;
      }
    }

    return false;
  }

  /**
   * Handle private lesson specific reschedule logic
   * Legacy: if ($oldLesson->isPrivate()) { ... }
   */
  async handlePrivateLessonReschedule(
    oldLesson: Lesson,
    newLesson: Lesson,
    manager?: EntityManager,
  ): Promise<void> {
    const paymentCycleRepo = manager
      ? manager.getRepository(PaymentCycleLesson)
      : this.paymentCycleLessonRepository;
    const splitUsageRepo = manager
      ? manager.getRepository(LessonSplitUsage)
      : this.lessonSplitUsageRepository;

    // Handle usedLessonSplits (legacy: updates extendedLessonId). Use manager + batch save.
    const usedLessonSplits = await splitUsageRepo.find({
      where: { extendedLessonId: oldLesson.id },
    });
    for (const splitUsage of usedLessonSplits) {
      splitUsage.extendedLessonId = newLesson.id;
    }
    if (usedLessonSplits.length > 0) {
      await splitUsageRepo.save(usedLessonSplits);
    }

    // Handle paymentCycleLesson
    const oldPaymentCycleLesson = await paymentCycleRepo.findOne({
      where: {
        lessonId: oldLesson.id,
        isDeleted: 0, // Entity defines isDeleted as number, so 0 is correct
      },
    });

    if (oldPaymentCycleLesson) {
      // Transfer payment cycle lesson to new lesson
      oldPaymentCycleLesson.lessonId = newLesson.id;
      await paymentCycleRepo.save(oldPaymentCycleLesson);
    } else {
      // Handle isExploded lessons - create payment cycle lessons for leafs. Batch load + batch save.
      if (newLesson.isExploded === 1) {
        const leafLessons = await this.getLeafLessons(oldLesson.id, manager);
        const leafIds = leafLessons.map((l) => l.id);
        if (leafIds.length > 0) {
          const leafPaymentCycleLessons = await paymentCycleRepo.find({
            where: {
              lessonId: In(leafIds),
              isDeleted: 0,
            },
          });
          const newPaymentCycleLessons = leafPaymentCycleLessons.map((pcl) =>
            paymentCycleRepo.create({
              lessonId: newLesson.id,
              paymentCycleId: pcl.paymentCycleId,
              isDeleted: 0,
            }),
          );
          if (newPaymentCycleLessons.length > 0) {
            await paymentCycleRepo.save(newPaymentCycleLessons);
          }
        }
      }
    }
  }

  /**
   * Get leaf lessons (descendants) of a lesson
   * Legacy: $oldLesson->getLeafs()
   */
  private async getLeafLessons(
    lessonId: number,
    manager?: EntityManager,
  ): Promise<Lesson[]> {
    const hierarchyRepo = manager
      ? manager.getRepository(LessonHierarchy)
      : this.lessonHierarchyRepository;
    const lessonRepo = manager
      ? manager.getRepository(Lesson)
      : this.lessonRepository;

    // Get all descendants via lesson hierarchy where lessonId is the ancestor
    const descendants = await hierarchyRepo.find({
      where: { lessonId: lessonId },
    });
    const descendantIds = descendants
      .map((d) => d.childLessonId)
      .filter((id) => id !== lessonId); // Exclude self

    if (descendantIds.length === 0) {
      return [];
    }

    return lessonRepo.find({
      where: { id: In(descendantIds) },
    });
  }

  /**
   * Set expiry date for private lesson (legacy: $lesson->setExpiry())
   * Legacy: Sets expiry date based on root lesson or 90 days from lesson date
   * Only creates if privateLesson doesn't exist and program is private
   */
  async setExpiryForPrivateLesson(
    lesson: Lesson,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonId = Number(lesson?.id);
    const privateLessonRepo = manager
      ? manager.getRepository(PrivateLesson)
      : this.privateLessonRepository;
    const lessonRepo = manager
      ? manager.getRepository(Lesson)
      : this.lessonRepository;
    const hierarchyRepo = manager
      ? manager.getRepository(LessonHierarchy)
      : this.lessonHierarchyRepository;

    // Check if private lesson already exists (legacy: if (!$this->privateLesson)
    const existingPrivateLesson = await privateLessonRepo.findOne({
      where: { lessonId },
    });

    if (existingPrivateLesson) {
      // Already has private lesson, don't create
      return;
    }

    // Get course with program to check if it's private
    const lessonWithCourse = await lessonRepo.findOne({
      where: { id: lessonId },
      relations: ['course', 'course.program'],
    });

    const programType = this.normalizeProgramType(
      lessonWithCourse?.course?.program?.type,
    );
    const isPrivateProgram = programType === Program.TYPE_PRIVATE_PROGRAM;

    if (!isPrivateProgram) {
      return;
    }

    // Calculate expiry date
    let expiryDate: Date;

    // Get root lesson (lesson with depth 0 where lessonId = childLessonId)
    const rootHierarchy = await hierarchyRepo.findOne({
      where: {
        childLessonId: lessonId,
        lessonId, // Self-reference indicates root
        depth: 0,
      },
    });

    // If not root, find the root ancestor
    let rootLessonId = lessonId;
    if (!rootHierarchy) {
      // Find the ancestor with depth 0 (root)
      const ancestors = await hierarchyRepo.find({
        where: { childLessonId: lessonId },
        order: { depth: 'ASC' },
      });

      const rootAncestor = ancestors.find(
        (a) => a.lessonId === a.childLessonId,
      );
      if (rootAncestor) {
        rootLessonId = rootAncestor.lessonId;
      }
    }

    // Get root lesson's private lesson
    if (rootLessonId !== lessonId) {
      const rootPrivateLesson = await privateLessonRepo.findOne({
        where: { lessonId: rootLessonId },
      });

      if (rootPrivateLesson?.expiryDate) {
        const rootExpiry = new Date(rootPrivateLesson.expiryDate);
        const lessonDate = new Date(lesson.date);

        if (lessonDate >= rootExpiry) {
          // Lesson date is after or equal to root expiry, set to lesson date + 1 day
          expiryDate = new Date(lessonDate);
          expiryDate.setDate(expiryDate.getDate() + 1);
        } else {
          expiryDate = rootExpiry;
        }
      } else {
        // No root expiry, default to 90 days
        expiryDate = new Date(lesson.date);
        expiryDate.setDate(expiryDate.getDate() + 90);
      }
    } else {
      // No root lesson, default to 90 days from lesson date
      expiryDate = new Date(lesson.date);
      expiryDate.setDate(expiryDate.getDate() + 90);
    }

    // Create private lesson with expiry date
    // Legacy: PrivateLesson::beforeSave() sets total and balance from lesson->netPrice
    // On insert: total = balance = round(lesson->netPrice, 2)
    // Ensure discounts are loaded before calling getNetPrice()
    if (!lesson.discounts) {
      const lessonWithDiscounts = await lessonRepo.findOne({
        where: { id: lessonId },
        relations: ['discounts'],
      });
      if (lessonWithDiscounts) {
        lesson = lessonWithDiscounts;
      }
    }
    const netPrice = lesson.getNetPrice();
    const total = RoundingUtils.roundDecimal(netPrice, 2);
    const privateLesson = privateLessonRepo.create({
      lessonId,
      expiryDate: expiryDate,
      total,
      balance: total,
      dueDate: expiryDate,
    });

    // Keep relation unset so explicit lessonId is always the source of truth.
    // (privateLesson as any).lesson = undefined;
    await privateLessonRepo.save(privateLesson);
  }

  /**
   * Recalculate private lesson total/balance after substitute operations.
   * This restores legacy-like behavior where private_lesson values are refreshed
   * after lesson changes and payment/discount movements.
   */
  async recalculatePrivateLessonAmounts(
    lessonId: number,
    manager: EntityManager,
  ): Promise<void> {
    const normalizedLessonId = Number(lessonId);

    const lessonRepo = manager.getRepository(Lesson);
    const privateLessonRepo = manager.getRepository(PrivateLesson);
    const lessonPaymentRepo = manager.getRepository(LessonPayment);

    const lesson = await lessonRepo.findOne({
      where: { id: normalizedLessonId },
      relations: ['discounts'],
    });
    if (!lesson) {
      return;
    }

    const privateLesson = await privateLessonRepo.findOne({
      where: { lessonId: normalizedLessonId },
    });
    if (!privateLesson) {
      return;
    }

    const total = RoundingUtils.roundDecimal(lesson.getNetPrice(), 2);
    const lessonPayments = await lessonPaymentRepo.find({
      where: { lessonId: normalizedLessonId, isDeleted: 0 },
    });
    const totalPaid = lessonPayments.reduce(
      (sum, payment) => sum + Number(payment.amount ?? 0),
      0,
    );
    const balance = RoundingUtils.roundDecimal(total - totalPaid, 2);

    privateLesson.total = total;
    privateLesson.balance = balance;
    await privateLessonRepo.save(privateLesson);
  }

  /**
   * Remove invalid orphan private_lesson rows.
   * lessonId must always reference a real lesson (> 0).
   */
  async cleanupInvalidPrivateLessons(manager: EntityManager): Promise<void> {
    await manager
      .createQueryBuilder()
      .delete()
      .from(PrivateLesson)
      .where('lessonId <= :minLessonId', { minLessonId: 0 })
      .execute();
  }
}
