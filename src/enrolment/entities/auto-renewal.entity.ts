import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auto_renewal')
export class AutoRenewal {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true })
  @Index()
  enrolmentId: number;

  @Column({ name: 'paymentFrequency', type: 'int', unsigned: true })
  paymentFrequency: number;

  @Column({ name: 'enrolmentEndDateCurrent', type: 'datetime', default: () => "'0000-00-00 00:00:00'" })
  enrolmentEndDateCurrent: Date;

  @Column({ name: 'enrolmentEndDateNew', type: 'datetime', default: () => "'0000-00-00 00:00:00'" })
  enrolmentEndDateNew: Date;

  @Column({ name: 'lastPaymentCycleStartDate', type: 'datetime', default: () => "'0000-00-00 00:00:00'" })
  lastPaymentCycleStartDate: Date;

  @Column({ name: 'lastPaymentCycleEndDate', type: 'datetime', default: () => "'0000-00-00 00:00:00'" })
  lastPaymentCycleEndDate: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;
}
