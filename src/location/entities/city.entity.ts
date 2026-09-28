import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Province } from './province.entity';

@Entity('city')
export class City {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ name: 'province_id' })
  provinceId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: false })
  isDeleted: boolean;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  @ManyToOne(() => Province, { nullable: true })
  @JoinColumn({ name: 'province_id' })
  province: Province;
}
