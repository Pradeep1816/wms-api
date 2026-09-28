import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('rbac_auth_item_child')
export class RbacAuthItemChild {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  parent: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  child: string;

  @Column({ name: 'location_id', type: 'int', nullable: true })
  locationId: number;
}
