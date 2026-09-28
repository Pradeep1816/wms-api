import { Entity, Column, PrimaryGeneratedColumn, JoinColumn, OneToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { ReferralSource } from '../../referral-source/entities/referral-source.entity';

@Entity('customer_referral_sources')
export class CustomerReferralSources {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId', type: 'int', nullable: true })
  userId: number;

  @Column({ name: 'referralSourceId', type: 'int', nullable: true })
  referralSourceId: number;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description: string;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @OneToOne(() => User, user => user.customerReferralSource)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToOne(() => ReferralSource, referralSource => referralSource.customerReferralSources)
  @JoinColumn({ name: 'referralSourceId' })
  referralSource: ReferralSource;
}
