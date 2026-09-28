import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EquipmentRental } from './equipment-rental.entity';
import { Item } from '../../item/entities/item.entity';

@Entity('equipment_rental_instruments')
export class EquipmentRentalInstrument {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'equipmentRentalsId', type: 'int' })
  equipmentRentalsId: number;

  @Column({ name: 'instrument', type: 'int' })
  instrument: number; // Item ID

  @Column({ name: 'value', type: 'text', nullable: true })
  value: string; // Retail value

  @Column({ name: 'asset', type: 'text', nullable: true })
  asset: string; // Asset tag

  @Column({ name: 'serial_number', type: 'int', nullable: true })
  serialNumber: number;

  // Relations
  @ManyToOne(() => EquipmentRental)
  @JoinColumn({ name: 'equipmentRentalsId' })
  equipmentRental: EquipmentRental;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'instrument' })
  item: Item;
}

