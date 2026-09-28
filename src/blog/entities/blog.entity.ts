import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('blog')
export class Blog {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;
  
  @Column({ type: 'text', nullable: false })
  title: string;

  @Column({ type: 'text', nullable: false })
  content: string;

  @Column({ name: 'date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: false })
  isDeleted: boolean;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true, nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true, nullable: false })
  updatedByUserId: number;

  @ManyToOne(() => User, (user) => user.blog)
  @JoinColumn({ name: 'user_id' })
  user: User;

}


