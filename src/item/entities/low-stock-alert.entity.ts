import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LowStockAlertStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'suppressed'
  | 'failed'
  | 'review';

/** Durable outbox, committed atomically with the stock movement. Times are epoch
 * milliseconds so retry scheduling is independent of legacy Eastern DB dates. */
@Entity('low_stock_alert')
@Index('IDX_low_stock_alert_due', ['status', 'nextAttemptAt'])
export class LowStockAlert {
  @PrimaryGeneratedColumn({ unsigned: true }) id: number;
  @Column({ type: 'int', unsigned: true }) itemId: number;
  @Column({ type: 'int', unsigned: true }) locationId: number;
  @Column({ type: 'int', unsigned: true }) stockQuantity: number;
  @Column({ type: 'int', unsigned: true }) lowStockQuantity: number;
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: LowStockAlertStatus;
  @Column({ type: 'int', unsigned: true, default: 0 }) attempts: number;
  @Column({ type: 'bigint' }) createdAt: number;
  @Column({ type: 'bigint' }) nextAttemptAt: number;
  @Column({ type: 'bigint', nullable: true }) sentAt: number | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) recipient:
    | string
    | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) lastError:
    | string
    | null;
}
