import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Location } from './location.entity';

@Entity('location_availability')
export class LocationAvailability {
  static readonly DEFAULT_FROM_TIME = '09:00:00';
  static readonly DEFAULT_TO_TIME = '17:00:00';
  static readonly TYPE_OPERATION_TIME = 1;
  static readonly TYPE_SCHEDULE_TIME = 2;

  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'day', type: 'tinyint', unsigned: true })
  day: number;

  @Column({ name: 'type', type: 'int' })
  type: number;

  @Column({ name: 'fromTime', type: 'time', default: '00:00:00' })
  fromTime: string;

  @Column({ name: 'toTime', type: 'time', default: '00:00:00' })
  toTime: string;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  // Relationship with Location entity
  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;
}
