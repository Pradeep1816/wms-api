import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('calendar_event_color')
export class CalendarEventColor {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ 
    type: 'varchar', 
    length: 50
  })
  name: string;

  @Column({ 
    type: 'char', 
    length: 8
  })
  code: string;

  @Column({ 
    type: 'varchar', 
    length: 30
  })
  cssClass: string;
}
