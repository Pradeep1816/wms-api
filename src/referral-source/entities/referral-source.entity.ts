import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CustomerReferralSources } from '../../customer/entities/customer-referral-sources.entity';

@Entity('referral_sources')
export class ReferralSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn({ name: 'createdOn' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn' })
  updatedOn: Date;

  @Column({ name: 'createdByUserId' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId' })
  updatedByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: number;

  @OneToMany(() => CustomerReferralSources, customerReferralSources => customerReferralSources.referralSource)
  customerReferralSources: CustomerReferralSources[];

  static readonly REFERRAL_SOURCE_OTHER = 4;
}
