import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { TaxType } from './tax-type.entity';
import { Province } from 'src/location/entities/province.entity';

@Entity('tax_code')
export class TaxCode {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'tax_type_id', type: 'int', unsigned: true })
  @Index('tax_type_id')
  taxTypeId: number;

  @Column({ name: 'province_id', type: 'int', unsigned: true })
  @Index('province_id')
  provinceId: number;

  @Column({ type: 'decimal', precision: 4, scale: 2 })
  rate: number;

  @Column({ name: 'start_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' })
  startDate: Date;

  @Column({ type: 'varchar', length: 5, nullable: true })
  code: string;

  static HST = 1;
  @ManyToOne(() => TaxType)
  @JoinColumn({ name: 'tax_type_id' })
  taxType: TaxType;

  @ManyToOne(() => Province)
  @JoinColumn({ name: 'province_id' })
  province: Province;

}
