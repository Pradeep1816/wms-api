import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('release_notes')
export class ReleaseNotes {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subject: string;

  @Column()
  summary: string;

  @Column('text')
  notes: string;

  @Column({ name: 'schedule_date', type: 'datetime' })
  scheduleDate: Date;

  @Column({type:'varchar',length:10,nullable:true})
  version:string

  @Column({ type: 'datetime' })
  date: Date;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'isDeleted', type: 'boolean', default: false })
  isDeleted: boolean;
}
