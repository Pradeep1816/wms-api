import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('location_debt')
export class LocationDebt {
  static readonly TYPE_ROYALTY = 1;
  static readonly TYPE_ADVERTISEMENT = 2;

  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'tinyint', unsigned: true })
  @Index('locationId')
  locationId: number;

  @Column({ type: 'tinyint', unsigned: true })
  type: number;

  @Column({ type: 'float', unsigned: true })
  value: number;

  /** Migration baseline for historical New Report ranges without ledger activity. */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  advertisementBaseline: number | null;
}
