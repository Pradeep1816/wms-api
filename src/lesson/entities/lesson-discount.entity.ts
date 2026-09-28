import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToOne, OneToMany } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('lesson_discount')
export class LessonDiscount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({type: 'int', unsigned: true})
  lessonId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  value: number | null;

  @Column({type: 'int', nullable: true})
  enrolmentId: number | null;

  @Column({type: 'tinyint', width: 1, nullable: false})
  valueType: number;

  @Column({type: 'int', nullable: false})
  type: number;

  @ManyToOne(() => Lesson, lesson => lesson.discounts)
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  // Discount type constants
  static readonly TYPE_CUSTOMER = 1;
  static readonly TYPE_ENROLMENT_PAYMENT_FREQUENCY = 2;
  static readonly TYPE_MULTIPLE_ENROLMENT = 3;
  static readonly TYPE_LINE_ITEM = 4;
  static readonly TYPE_GROUP = 5;
  /**
   * September 2026 prepaid cycle reduction, in **dollars**.
   *
   * Arcadia's 3, 6 and 12-month prices are published whole-dollar totals that
   * are not percentages of anything - $844.00 where 3% off $870.00 would be
   * $843.90 - so the reduction cannot be a percentage and cannot ride on
   * `TYPE_ENROLMENT_PAYMENT_FREQUENCY`, which every calculator treats as one.
   *
   * A type of its own rather than a line item: `getDiscount` finds a discount
   * by type with `.find()`, so a prepaid row sharing `TYPE_LINE_ITEM` with a
   * staff-applied one would silently apply only whichever came first.
   *
   * Its presence also **suppresses** the payment-frequency discount on that
   * lesson. The two express the same entitlement and applying both would
   * discount the cycle twice.
   *
   * ## Why 6 is skipped
   *
   * 6 was reserved for grandfathering while that was still going to be a
   * discount. It became a flag instead - `enrolment.keepsPreviousRate` - so 6
   * is permanently vacant rather than free. Reusing it would make old analysis
   * of the paused migration branch, where 6 does mean grandfathered, silently
   * wrong.
   */
  static readonly TYPE_PREPAID_CYCLE = 7;
}