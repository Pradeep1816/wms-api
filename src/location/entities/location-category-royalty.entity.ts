import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('location_category_royalty')
export class LocationCategoryRoyalty {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'itemCategoryId', type: 'int', unsigned: true })
  itemCategoryId: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  royality: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisement: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: true })
  createdByUserId: number | null;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: true })
  updatedByUserId: number | null;
}
