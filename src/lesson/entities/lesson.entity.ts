import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { LessonHierarchy } from './lesson-hierarchy.entity';
import { Classroom } from '../../classroom/entities/classroom.entity';
import { User } from '../../user/entities/user.entity';
import { BulkRescheduleLesson } from './bulk-reschedule-lesson.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { PrivateLesson } from './private-lesson.entity';
import { GroupLesson } from './group-lesson.entity';
import { LessonDiscount } from './lesson-discount.entity';
import { LessonSplitUsage } from './lesson-split-usage.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { RoundingUtils } from '../../utils/rounding.utils';

@Entity('lesson')
export class Lesson {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'courseId', type: 'int', unsigned: true, nullable: false })
  @Index('courseid')
  courseId: number;

  @Column({ name: 'teacherId', type: 'int', unsigned: true, nullable: false })
  @Index('teacherId')
  teacherId: number;

  @Column({ name: 'classroomId', type: 'int', nullable: true })
  @Index('classroomId')
  classroomId: number;

  @Column({ name: 'colorCode', type: 'char', length: 7, nullable: true })
  colorCode: string;

  @Column({ type: 'datetime', nullable: false, default: 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ type: 'time', nullable: false })
  duration: string;

  @Column({ type: 'tinyint', unsigned: true, nullable: false })
  status: number;

  @Column({ name: 'isPresent', type: 'tinyint', width: 1, nullable: false })
  isPresent: boolean;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: false })
  isDeleted: boolean;

  @Column({ name: 'isConfirmed', type: 'tinyint', width: 1, nullable: true })
  isConfirmed: boolean;

  @Column({ type: 'tinyint', unsigned: true, nullable: false })
  type: number;

  @Column({ name: 'isExploded', type: 'int', nullable: false })
  isExploded: number;

  @Column({ name: 'is_online', type: 'tinyint', width: 1, nullable: false, default: 0 })
  isOnline: boolean;

  @Column({ name: 'createdByUserId', type: 'int', nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: false })
  updatedByUserId: number;

  @Column({ name: 'programRate', type: 'decimal', precision: 10, scale: 4, nullable: false })
  programRate: number;

  @Column({ name: 'teacherRate', type: 'decimal', precision: 10, scale: 4, nullable: false })
  teacherRate: number;

  @Column({ name: 'teacherRateOld', type: 'decimal', precision: 10, scale: 4, nullable: false })
  teacherRateOld: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false, default: 0.0000 })
  tax: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'paidStatus', type: 'int', nullable: false, default: 0 })
  paidStatus: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false, default: 0.0000 })
  total: number;

  @Column({ name: 'dueDate', type: 'date', nullable: false })
  dueDate: Date;

  @Column({ name: 'originalDate', type: 'datetime', nullable: true })
  @Index('originalDate')
  originalDate: Date;

  // Relations
  @ManyToOne(() => Course, course => course.lessons)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => User, user => user.id)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;

  @OneToMany(() => LessonHierarchy, hierarchy => hierarchy.childLesson)
  lessonHierarchy: LessonHierarchy[];

  @ManyToOne(() => Classroom, classroom => classroom.id)
  @JoinColumn({ name: 'classroomId' })
  classroom: Classroom;

  @OneToMany(() => BulkRescheduleLesson, bulkRescheduleLesson => bulkRescheduleLesson.lesson)
  bulkRescheduleLesson: BulkRescheduleLesson[];
  @OneToMany(() => InvoiceItemLesson, invoiceItemLesson => invoiceItemLesson.lesson)
  invoiceItemLessons: InvoiceItemLesson[];

  @OneToMany(() => PrivateLesson, privateLesson => privateLesson.lesson)
  privateLesson: PrivateLesson[];

  @OneToMany(() => GroupLesson, groupLesson => groupLesson.lesson)
  groupLesson: GroupLesson[];

  @OneToMany(() => LessonDiscount, discount => discount.lesson)
  discounts: LessonDiscount[];

  @OneToMany(() => LessonSplitUsage, lsu => lsu.extendedLesson)
  usedLessonSplits: LessonSplitUsage[];

  /**
   * Get unit (duration in hours)
   * Parses duration string to hours
   * Examples: "01:00:00" = 1, "01:30:00" = 1.5, "00:45:00" = 0.75
   */
  getUnit(): number {
    return RoundingUtils.durationToHours(this.duration).toNumber();
  }

  /**
   * Get gross price (programRate * duration in hours)
   */
  getGrossPrice(): number {
    const rate = RoundingUtils.decimal(this.programRate ?? 0);
    const unit = RoundingUtils.durationToHours(this.duration);
    const gross = rate.times(unit);
    return RoundingUtils.roundDecimal(gross, 2);
  }

  private getFinancialBreakdown(): {
    gross: number;
    discount: number;
    subTotal: number;
  } {
    const gross = RoundingUtils.decimal(this.getGrossPrice());
    let discount = RoundingUtils.decimal(0);
    let lessonPrice = gross;

    const getDiscountByType = (type: number) =>
      this.discounts?.find(d => d.type === type);

    const addFixedDiscount = (value: number | null | undefined) => {
      const amount = RoundingUtils.decimal(value ?? 0);
      discount = discount.plus(lessonPrice.isLessThan(0) ? 0 : amount);
      lessonPrice = gross.minus(discount);
    };

    const addPercentageDiscount = (value: number | null | undefined) => {
      const amount = RoundingUtils.decimal(value ?? 0);
      discount = discount.plus(lessonPrice.times(amount).dividedBy(100));
      lessonPrice = gross.minus(discount);
    };

    // 1. MultiEnrolment (type 3) - dollar amount
    const multi = getDiscountByType(LessonDiscount.TYPE_MULTIPLE_ENROLMENT);
    if (multi) {
      addFixedDiscount(multi.value);
    }

    // 2. LineItem (type 4) - percentage or dollar
    const lineItem = getDiscountByType(LessonDiscount.TYPE_LINE_ITEM);
    if (lineItem) {
      if (lineItem.valueType) {
        addPercentageDiscount(lineItem.value);
      } else {
        addFixedDiscount(lineItem.value);
      }
    }

    // 3. Customer (type 1) - percentage
    const customer = getDiscountByType(LessonDiscount.TYPE_CUSTOMER);
    if (customer) {
      addPercentageDiscount(customer.value);
    }

    // 4. PrepaidCycle (type 7) - a dollar amount, and it REPLACES payment
    //    frequency rather than stacking with it.
    const prepaid = getDiscountByType(LessonDiscount.TYPE_PREPAID_CYCLE);
    if (prepaid) {
      discount = discount.plus(
        RoundingUtils.prepaidReduction(prepaid.value ?? 0, lessonPrice),
      );
      const subTotal = gross.minus(discount);
      return {
        gross: Number(gross.toFixed(4)),
        discount: Number(discount.toFixed(4)),
        subTotal: Number(subTotal.toFixed(4)),
      };
    }

    // 5. PaymentFrequency (type 2) - percentage
    const freq = getDiscountByType(
      LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
    );
    if (freq) {
      addPercentageDiscount(freq.value);
    }

    const subTotal = gross.minus(discount);
    return {
      gross: Number(gross.toFixed(4)),
      discount: Number(discount.toFixed(4)),
      subTotal: Number(subTotal.toFixed(4)),
    };
  }

  /**
   * Get total discount amount
   * Applies discounts in order: MultiEnrolment -> LineItem -> Customer ->
   * PrepaidCycle (which stops here) or PaymentFrequency
   */
  getDiscount(): number {
    return this.getFinancialBreakdown().discount;
  }

  /**
   * Get subtotal (gross price - discounts)
   */
  getSubTotal(): number {
    return this.getFinancialBreakdown().subTotal;
  }

  /**
   * Get net price (subtotal + tax)
   */
  getNetPrice(): number {
    const { subTotal } = this.getFinancialBreakdown();
    const tax = RoundingUtils.decimal(this.tax ?? 0);
    return RoundingUtils.roundDecimal(RoundingUtils.decimal(subTotal).plus(tax), 2);
  }

  /**
   * Check if lesson is completed
   */
  private isCompleted(): boolean {
    return this.status === LessonStatusEnum.COMPLETED;
  }

  /**
   * Get the human-readable status string for the lesson
   * @returns Status string or null
   */
  getStatus(): string | null {
    const now = new Date();

    let status: string | null = null;

    const isCompleted = this.isCompleted();

    const isExpired = (() => {
      if (this.privateLesson[0]?.expiryDate && this.status === LessonStatusEnum.UNSCHEDULED) {
        const expiryDate = new Date(this.privateLesson[0].expiryDate);
        return now > expiryDate;
      }
      return false;
    })();

    if (isExpired) {
      return 'Expired';
    }

    switch (this.status) {
      case LessonStatusEnum.SCHEDULED:
        if (!isCompleted && this.isPresent) {
          status = 'Scheduled';
        } else if (!this.isPresent) {
          status = 'Absent';
        } else {
          status = 'Completed';
        }
        break;

      case LessonStatusEnum.CANCELED:
        status = 'Canceled';
        break;

      case LessonStatusEnum.RESCHEDULED:
        if (!isCompleted) {
          status = 'Rescheduled';
        } else if (!this.isPresent) {
          status = 'Absent';
        } else {
          status = 'Completed';
        }
        break;

      case LessonStatusEnum.UNSCHEDULED:
        if (!isExpired) {
          status = 'Unscheduled';
          if (this.isExploded) {
            status += ' (Exploded)';
          }
        }
        break;
    }

    return status;
  }

}
