import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auto_renewal_payment_cycle')
export class AutoRenewalPaymentCycle {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'autoRenewalId', type: 'int', unsigned: true })
  @Index()
  autoRenewalId: number;

  @Column({ name: 'paymentCycleId', type: 'int', unsigned: true })
  @Index()
  paymentCycleId: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;
}

