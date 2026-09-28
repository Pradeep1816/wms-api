import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Location } from './location.entity';

@Entity('location_walkin_customer')
export class LocationWalkinCustomer {
  /** Default firstname for walk-in customer user profile */
  static readonly WALKIN_FIRSTNAME = 'Walkin';
  /** Default lastname for walk-in customer user profile */
  static readonly WALKIN_LASTNAME = 'Customer';

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customerId', type: 'int' })
  customerId: number;

  @Column({ name: 'locationId', type: 'int' })
  locationId: number;

  // Relations
  @ManyToOne(() => User, user => user.locationWalkin)
  @JoinColumn({ name: 'customerId' })
  user: User;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'locationId' })
  location: Location;
}
