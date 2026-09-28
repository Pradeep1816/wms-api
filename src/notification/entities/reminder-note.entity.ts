import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('reminder_note')
export class ReminderNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  notes: string;

  @Column({ name: 'createdOn', type: 'datetime', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'datetime', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: true })
  updatedByUserId: number;
}
