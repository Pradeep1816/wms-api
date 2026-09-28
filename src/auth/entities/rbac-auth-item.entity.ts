import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
} from 'typeorm';

@Entity('rbac_auth_item')
export class RbacAuthItem {
  static readonly TYPE_ROLE = 1;
  static readonly TYPE_PERMISSION = 2;
  
  @PrimaryColumn({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int' })
  type: number;

  @Column({ type: 'int', default: 0 })
  isLocationSpecific: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  rule_name: string;

  @Column({ type: 'text', nullable: true })
  data: string;

  @Column({ type: 'int', nullable: true })
  created_at: number;

  @Column({ type: 'int', nullable: true })
  updated_at: number;

  @OneToMany('RbacAuthAssignment', 'item')
  assignments: any[];
}
