import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { Course } from '../../course/entities/course.entity';

@Entity('invoice_item_enrolment')
export class InvoiceItemEnrolment {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column()
  invoiceLineItemId: number;

  @Column()
  enrolmentId: number;

  @OneToOne(() => InvoiceLineItem, (invoiceLineItem) => invoiceLineItem.invoiceItemEnrolment)
  @JoinColumn({ name: 'invoiceLineItemId' }) 
  invoiceLineItem: InvoiceLineItem;
  
  @ManyToOne(() => Course, course => course.invoiceItemsEnrolment)
  @JoinColumn({ name: 'enrolmentId' })
  course: Course;

  @OneToOne(() => Enrolment, (enrolment) => enrolment.invoiceItemEnrolment)
  @JoinColumn({ name: 'enrolmentId' }) 
  enrolment: Enrolment;

}
