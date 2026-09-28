import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserContact } from './user-contact.entity';
import { City } from '../../location/entities/city.entity';
import { Province } from '../../location/entities/province.entity';
import { Country } from '../../location/entities/country.entity';

@Entity('user_address')
export class UserAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userContactId' })
  userContactId: number;

  @Column({ type: 'varchar', length: 64 })
  address: string;

  @Column({ name: 'cityId' })
  cityId: number;

  @Column({ name: 'provinceId' })
  provinceId: number;

  @Column({ name: 'countryId' })
  countryId: number;

  @Column({ name: 'postalCode', type: 'varchar', length: 16, nullable: true })
  postalCode: string;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: false })
  isDeleted: boolean;

  @ManyToOne(() => UserContact, { nullable: true })
  @JoinColumn({ name: 'userContactId' })
  userContact: UserContact;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'cityId' })
  city: City;

  @ManyToOne(() => Province, { nullable: true })
  @JoinColumn({ name: 'provinceId' })
  province: Province;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'countryId' })
  country: Country;
}
