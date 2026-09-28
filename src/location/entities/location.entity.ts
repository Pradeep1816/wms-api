import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { City } from './city.entity';
import { Province } from './province.entity';
import { Country } from './country.entity';

@Entity('location')
export class Location {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({
    name: 'legal_corporate_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  legalCorporateName: string | null;

  @Column({ type: 'varchar', length: 64 })
  address: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 16 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string;

  @Column({ name: 'city_id', type: 'int', unsigned: true })
  cityId: number;

  @Column({ name: 'province_id', type: 'int', unsigned: true })
  provinceId: number;

  @Column({ name: 'postal_code', type: 'varchar', length: 16 })
  postalCode: string;

  @Column({ name: 'country_id', type: 'int', unsigned: true })
  countryId: number;

  @Column({ type: 'varchar', length: 30 })
  slug: string;

  @Column({ name: 'hst_registration_no', type: 'varchar', length: 20, nullable: true })
  hstRegistrationNo: string;

  @Column({ name: 'conversionDate', type: 'timestamp', nullable: true })
  conversionDate: Date;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @Column({ name: 'isEnabledCron', type: 'tinyint', width: 1 })
  isEnabledCron: boolean;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'city_id' })
  city?: City;

  @ManyToOne(() => Province, { nullable: true })
  @JoinColumn({ name: 'province_id' })
  province?: Province;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'country_id' })
  country?: Country;
}
