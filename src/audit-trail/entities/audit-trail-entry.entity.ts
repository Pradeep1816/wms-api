import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('audit_trail_entry')
@Index('IN_audit_trail_entry_fast_access', ['modelType', 'happenedAt'])
@Index('FK_audit_trail_entry_user', ['userId'])
export class AuditTrailEntryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'model_type', type: 'varchar', length: 255 })
  modelType: string;

  @Column({ name: 'happened_at', type: 'int' })
  happenedAt: number;

  @Column({ name: 'foreign_pk', type: 'varchar', length: 255 })
  foreignPk: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'type', type: 'varchar', length: 255 })
  type: string;

  @Column({ name: 'data', type: 'text', nullable: true })
  data: string | null;

  // Load the actor for the audit entry when it still exists in the user table.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;
}

