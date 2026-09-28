import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { InvoiceLineItem } from './invoice-line-item.entity';

@Entity('invoice_item_lesson')
export class InvoiceItemLesson {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'invoiceLineItemId', type: 'int', unsigned: true, nullable: false })
  @Index('invoiceLineItemId')
  invoiceLineItemId: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true, nullable: false })
  @Index('lessonId')
  lessonId: number;

  @ManyToOne(() => Lesson, (lesson) => lesson.invoiceItemLessons)
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @OneToOne(() => InvoiceLineItem, (invoiceLineItem) => invoiceLineItem.invoiceItemLesson)
  @JoinColumn({ name: 'invoiceLineItemId' }) 
  invoiceLineItem: InvoiceLineItem;
}  
