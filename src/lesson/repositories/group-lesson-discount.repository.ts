import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { GroupLesson } from '../entities/group-lesson.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';

@Injectable()
export class GroupLessonDiscountRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
  ) {}

  async findLessonInLocation(lessonId: number, locationId: number): Promise<Lesson | null> {
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoinAndSelect('lesson.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  async enrolmentExistsForLessonCourse(lessonId: number, enrolmentId: number): Promise<boolean> {
    const row = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.courseId = lesson.courseId AND enrolment.id = :enrolmentId AND enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
        { enrolmentId },
      )
      .select('lesson.id', 'lessonId')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = 0')
      .getRawOne();

    return !!row?.lessonId;
  }

  async findGroupLessonByLessonAndEnrolment(
    lessonId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<GroupLesson | null> {
    const repo = manager ? manager.getRepository(GroupLesson) : this.groupLessonRepository;
    return repo.findOne({
      where: { lessonId, enrolmentId, isDeleted: false },
    });
  }

  async hasInvoiceForLessonEnrolment(lessonId: number, enrolmentId: number): Promise<boolean> {
    const row = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .innerJoin('invoice_item_enrolment', 'iie', 'iie.invoiceLineItemId = iil.invoiceLineItemId')
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
      .innerJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
      .select('inv.id', 'invoiceId')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('iie.enrolmentId = :enrolmentId', { enrolmentId })
      .limit(1)
      .getRawOne();

    return !!row?.invoiceId;
  }

  async findGroupDiscount(lessonId: number, enrolmentId: number, manager?: EntityManager): Promise<LessonDiscount | null> {
    const repo = manager ? manager.getRepository(LessonDiscount) : this.lessonDiscountRepository;
    return repo.findOne({
      where: {
        lessonId,
        enrolmentId,
        type: LessonDiscount.TYPE_GROUP,
      },
    });
  }

  async saveGroupDiscount(
    lessonId: number,
    enrolmentId: number,
    value: number,
    valueType: number,
    manager?: EntityManager,
  ): Promise<LessonDiscount> {
    const repo = manager ? manager.getRepository(LessonDiscount) : this.lessonDiscountRepository;
    let discount = await this.findGroupDiscount(lessonId, enrolmentId, manager);

    if (!discount) {
      discount = repo.create({
        lessonId,
        enrolmentId,
        type: LessonDiscount.TYPE_GROUP,
        value,
        valueType,
      });
    } else {
      discount.value = value;
      discount.valueType = valueType;
    }

    return repo.save(discount);
  }

  async getCreditAppliedAmount(
    lessonId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const em = manager ?? this.lessonRepository.manager;
    const row = await em
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'totalPaid')
      .from('lesson_payment', 'lp')
      .innerJoin(
        'payment',
        'p',
        'p.id = lp.paymentId AND (p.isDeleted = 0 OR p.isDeleted IS NULL)',
      )
      .innerJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .andWhere('pm.id != :creditUsed', { creditUsed: PaymentMethod.TYPE_CREDIT_USED })
      .getRawOne();

    return Number(row?.totalPaid || 0);
  }

  async getCustomerIdByEnrolment(enrolmentId: number): Promise<number | null> {
    const row = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment', 'enrolment.id = :enrolmentId', { enrolmentId })
      .innerJoin('enrolment.student', 'student')
      .select('student.customerId', 'customerId')
      .limit(1)
      .getRawOne();

    return row?.customerId ? Number(row.customerId) : null;
  }
}

