import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { TuitionPrepaidPrice } from './tuition-prepaid-price.entity';

/**
 * Effective-dated monthly tuition catalogue.
 *
 * One row per location scope / category / tier / duration / effective period.
 *
 * `locationId` is nullable: a NULL row is the global default that serves every
 * location, and a location-scoped row overrides it. Verified on 2026-08-10 that
 * all ten active locations currently charge identical rates, so the global row
 * is the normal case - the override capability exists so that a future
 * per-location price does not require a schema change.
 */
@Entity('tuition_price')
@Index(['pricingCategory', 'pricingTier', 'durationMinutes', 'effectiveFrom'])
export class TuitionPrice {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  /**
   * Which sheet this row belongs to.
   *
   * `september_2026` is the new structure; `legacy_pre_september_2026` is the
   * sheet in force before it, which grandfathered customers keep using **after**
   * the cutover. That is why the book is a dimension of its own rather than
   * something inferred from the date - dating the old sheet to end on 31 August
   * would put it out of reach exactly when it is needed.
   */
  @Column({ name: 'priceBook', type: 'varchar', length: 40 })
  @Index()
  priceBook: string;

  /** NULL means the global default that applies to every location. */
  @Column({ name: 'locationId', type: 'int', unsigned: true, nullable: true })
  @Index()
  locationId: number | null;

  @Column({
    name: 'pricingCategory',
    type: 'varchar',
    length: 20,
  })
  pricingCategory: PricingCategoryEnum;

  @Column({ name: 'pricingTier', type: 'tinyint', unsigned: true })
  pricingTier: number;

  @Column({ name: 'durationMinutes', type: 'smallint', unsigned: true })
  durationMinutes: number;

  @Column({ name: 'effectiveFrom', type: 'date' })
  effectiveFrom: Date;

  /** NULL means open-ended. */
  @Column({ name: 'effectiveTo', type: 'date', nullable: true })
  effectiveTo: Date | null;

  /**
   * Exact approved monthly tuition. This is the authoritative total for a
   * month and must not be reconstructed from a rounded per-lesson amount.
   */
  @Column({ name: 'monthlyAmount', type: 'decimal', precision: 10, scale: 2 })
  monthlyAmount: string;

  /**
   * Hourly rate used to populate the lesson rate snapshot, keeping lesson
   * generation on the existing `programRate` mechanism.
   */
  @Column({ name: 'hourlyRate', type: 'decimal', precision: 10, scale: 2 })
  hourlyRate: string;

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

  @OneToMany(() => TuitionPrepaidPrice, (prepaid) => prepaid.tuitionPrice)
  prepaidPrices: TuitionPrepaidPrice[];
}
