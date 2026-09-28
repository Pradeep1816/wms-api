import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
} from 'typeorm';

@Entity('rbac_auth_rule')
export class RbacAuthRule {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'text', nullable: true })
  data: string;

  @Column({ type: 'int', nullable: true })
  created_at: number;

  @Column({ type: 'int', nullable: true })
  updated_at: number;

  @OneToMany('RbacAuthItem', 'rule')
  items: any[];
}
