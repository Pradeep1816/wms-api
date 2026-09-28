import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('tax_type_tax_status_assoc')
export class TaxTypeTaxStatusAssoc {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'tax_type_id', type: 'int', unsigned: true })
  @Index('tax_type_id')
  taxTypeId: number;

  @Column({ name: 'tax_status_id', type: 'int', unsigned: true })
  @Index('tax_status_id')
  taxStatusId: number;

  @Column({ type: 'tinyint', unsigned: true })
  exempt: number;
}
