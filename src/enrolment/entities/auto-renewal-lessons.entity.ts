import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auto_renewal_lessons')
export class AutoRenewalLessons {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'autoRenewalId', type: 'int', unsigned: true })
  @Index()
  autoRenewalId: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true })
  @Index()
  lessonId: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;
}

