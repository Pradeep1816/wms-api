import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EquipmentRental } from './equipment-rental.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';

@Entity('equipment_rental_invoice')
export class EquipmentRentalInvoice {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'equipmentRentalsId', type: 'int' })
  equipmentRentalsId: number;

  @Column({ name: 'invoiceId', type: 'int' })
  invoiceId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: 0 })
  isDeleted: boolean;

  // Relations
  @ManyToOne(() => EquipmentRental)
  @JoinColumn({ name: 'equipmentRentalsId' })
  equipmentRental: EquipmentRental;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;
}

