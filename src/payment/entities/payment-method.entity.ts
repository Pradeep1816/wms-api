import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
} from 'typeorm';

@Entity('payment_method')
export class PaymentMethod {
  @PrimaryGeneratedColumn({ type: 'tinyint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'tinyint', unsigned: true })
  active: number;

  @Column({ type: 'tinyint', unsigned: true })
  displayed: number;

  @Column({ name: 'sortOrder', type: 'tinyint', unsigned: true })
  sortOrder: number;

  // Static type constants for convenience in queries and logic
  static TYPE_ACCOUNT_ENTRY = 1;
  static TYPE_CREDIT_USED = 2;
  static TYPE_CREDIT_APPLIED = 3;
  static TYPE_CASH = 4;
  static TYPE_CHEQUE = 5;
  static TYPE_CREDIT_CARD = 6;
  static TYPE_APPLY_CREDIT = 7;
  static TYPE_GIFT_CARD = 12;
  static TYPE_E_TRANSFER = 13;

  static STATUS_ACTIVE = 1;
  static STATUS_INACTIVE = 0;

}