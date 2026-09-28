import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { User } from './user.entity';
import { Location } from '../../location/entities/location.entity';

@Entity('user_location')
export class UserLocation {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'location_id', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'dateStarted', type: 'date', nullable: true })
  dateStarted: Date | null;

  // Relationship with User entity
  @OneToOne(() => User, user => user.userLocation)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Relationship with Location entity
  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location: Location;
}
