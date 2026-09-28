import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('tax_type')
export class TaxType {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'tinyint' })
  status: number;

  @Column({ name: 'sort_order', type: 'tinyint', unsigned: true })
  sortOrder: number;

  @Column({ type: 'tinyint', width: 1 })
  compounded: number;
}
