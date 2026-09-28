import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Enrolment } from './enrolment.entity';

@Entity('enrolment_discount')
export class EnrolmentDiscount {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true })
  @Index()
  enrolmentId: number;

  @Column({ name: 'discount', type: 'float', nullable: true })
  discount: number | null;

  @Column({ name: 'discountType', type: 'int' })
  discountType: number;

  @Column({ name: 'type', type: 'int' })
  type: number;

  @ManyToOne(() => Enrolment, enrolment => enrolment.discounts)
  @JoinColumn({ name: 'enrolmentId' })
  enrolment: Enrolment;

  // Discount type constants
 static TYPE_PAYMENT_FREQUENCY  = 1;
 static TYPE_MULTIPLE_ENROLMENT = 2;
 static TYPE_GROUP = 3;

 // Value type constants
 static VALUE_TYPE_PERCENTAGE = 0;
 static VALUE_TYPE_DOLLAR     = 1;
}


