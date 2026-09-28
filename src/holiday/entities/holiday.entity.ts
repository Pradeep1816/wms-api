import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('holiday')
export class Holiday {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ 
    name: 'description', 
    type: 'varchar', 
    length: 300, 
    nullable: true,
    charset: 'utf8mb3',
    collation: 'utf8mb3_unicode_ci'
  })
  description: string;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;
}
