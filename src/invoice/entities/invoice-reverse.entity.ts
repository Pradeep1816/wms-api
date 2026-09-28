import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('invoice_reverse')
export class InvoiceReverse {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'invoiceId', type: 'int', unsigned: true, nullable: false })
  @Index('invoiceId')
  invoiceId: number;

  @Column({ name: 'reversedInvoiceId', type: 'int', unsigned: true, nullable: false })
  @Index('reversedInvoiceId')
  reversedInvoiceId: number;
}
