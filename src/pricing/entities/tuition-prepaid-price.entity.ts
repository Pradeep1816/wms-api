import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TuitionPrice } from './tuition-price.entity';

/**
 * Exact approved prepaid totals for 3, 6 and 12 month terms.
 *
 * `amount` is the figure the customer pays for the whole term. It is loaded
 * verbatim from the client's approved schedule and is NEVER derived from a
 * percentage: Standard 30-minute Tier 2 for 3 months is 510.00, where a strict
 * 3% calculation would give 509.25. Both the client and Arcadia's owners
 * confirmed on 2026-08-04 that the whole-dollar figures are deliberate.
 *
 * `referencePercentage` exists only so a staff member can see roughly what
 * discount a term represents. It must never enter a billing calculation and
 * must never be serialised to a customer or instructor response.
 */
@Entity('tuition_prepaid_price')
@Index(['tuitionPriceId', 'termMonths'])
export class TuitionPrepaidPrice {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'tuitionPriceId', type: 'int', unsigned: true })
  @Index()
  tuitionPriceId: number;

  /** Term length in months: 3, 6 or 12. */
  @Column({ name: 'termMonths', type: 'tinyint', unsigned: true })
  termMonths: number;

  /** Exact approved total for the whole term. Never recomputed. */
  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  /** Internal explanation only. Never used in billing, never exposed. */
  @Column({
    name: 'referencePercentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  referencePercentage: string | null;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: 0 })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({
    name: 'createdByUserId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  createdByUserId: number | null;

  @Column({
    name: 'updatedByUserId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  updatedByUserId: number | null;

  @ManyToOne(() => TuitionPrice, (price) => price.prepaidPrices)
  @JoinColumn({ name: 'tuitionPriceId' })
  tuitionPrice: TuitionPrice;
}
