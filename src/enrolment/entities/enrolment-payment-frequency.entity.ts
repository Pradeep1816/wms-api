import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('enrolment_payment_frequency')
export class EnrolmentPaymentFrequency {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true })
  @Index()
  enrolmentId: number;

  @Column({ name: 'paymentFrequencyId', type: 'int', unsigned: true })
  @Index()
  paymentFrequencyId: number;

  @Column({ name: 'paymentCycleStartDate', type: 'date' })
  paymentCycleStartDate: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;
}


