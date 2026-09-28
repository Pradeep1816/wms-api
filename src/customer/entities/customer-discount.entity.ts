import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('customer_discount')
export class CustomerDiscount {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'customerId', unsigned: true })
  customerId: number;

  @Column({ type: 'float', nullable: true })
  value: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: true })
  isDeleted: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer: User;
}
