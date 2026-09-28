import { Entity, Column, PrimaryGeneratedColumn, JoinColumn, OneToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('note')
export class Note {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  instanceId: number;

  @Column()
  instanceType: number;

  @Column()
  content: string;

  @Column()
  createdUserId: number;

  @Column({ name: 'createdOn', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedOn: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'instanceId' })
  customer: User;

  @OneToOne(() => User)
  @JoinColumn({ name: 'createdUserId' })
  user: User;

  static INSTANCE_TYPE_STUDENT = 1;
  static INSTANCE_TYPE_USER = 2;
  static INSTANCE_TYPE_LESSON = 3;
  static INSTANCE_TYPE_INVOICE = 4;
  static INSTANCE_TYPE_PROFORMA = 5;
}
