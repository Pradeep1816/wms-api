import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { RbacAuthItem } from './rbac-auth-item.entity';
import { User } from '../../user/entities/user.entity';

@Entity('rbac_auth_assignment')
export class RbacAuthAssignment {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  item_name: string;

  @PrimaryColumn({ type: 'varchar'})
  user_id: string;

  @Column({ type: 'int', nullable: true })
  created_at: number;

  @ManyToOne(() => RbacAuthItem, item => item.assignments)
  @JoinColumn({ name: 'item_name' })
  item: RbacAuthItem;

  @OneToOne(() => User, (user) => user.rbacAuthAssignment)
  @JoinColumn({ name: 'user_id' }) // Explicitly map the column
  user: User;
}
