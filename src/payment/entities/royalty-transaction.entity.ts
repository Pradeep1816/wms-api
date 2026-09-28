import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';

@Entity('royalty_transaction')
export class RoyaltyTransaction {
  @Column({ type: 'boolean', default: false })
  isPos: boolean;

  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'paymentId', type: 'int', unsigned: true, nullable: true })
  paymentId: number | null;

  @Column({
    name: 'originalPaymentId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  originalPaymentId: number | null;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'customerId', type: 'int', unsigned: true })
  customerId: number;

  @Column({ name: 'itemCategoryId', type: 'int', unsigned: true })
  itemCategoryId: number;

  @Column({ name: 'categoryName', type: 'varchar', length: 255 })
  categoryName: string;

  @Column({
    name: 'rateApplied',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  rateApplied: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisementRateApplied: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  advertisementAmount: number;

  @Column({
    name: 'paymentAmount',
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
  })
  paymentAmount: number;

  @Column({
    name: 'revenueAmount',
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
  })
  revenueAmount: number;

  @Column({
    name: 'taxAmount',
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
  })
  taxAmount: number;

  @Column({
    name: 'royaltyAmount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  royaltyAmount: number;

  @Column({ name: 'royaltyFree', type: 'tinyint', width: 1, default: 0 })
  royaltyFree: boolean;

  @Column({ name: 'eventType', type: 'varchar', length: 32 })
  eventType: RoyaltyTransactionEventType;

  @Column({ name: 'effectiveDate', type: 'timestamp' })
  effectiveDate: Date;

  @Column({ name: 'sourceType', type: 'varchar', length: 32 })
  sourceType: RoyaltyTransactionSourceType;

  @Column({ name: 'sourceId', type: 'int', unsigned: true, nullable: true })
  sourceId: number | null;

  @Column({
    name: 'relatedRoyaltyTransactionId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  relatedRoyaltyTransactionId: number | null;

  @Column({ name: 'eventGroupId', type: 'varchar', length: 64, nullable: true })
  eventGroupId: string | null;

  @Column({ name: 'idempotencyKey', type: 'varchar', length: 191 })
  idempotencyKey: string;

  @Column({ name: 'reason', type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({
    name: 'schemaVersion',
    type: 'smallint',
    unsigned: true,
    default: 1,
  })
  schemaVersion: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: true })
  createdByUserId: number | null;
}
