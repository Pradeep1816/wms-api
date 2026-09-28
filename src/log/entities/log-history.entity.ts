import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Log } from './log.entity';

@Entity('log_history')
export class LogHistory {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column()
  logId: number;

  @Column()
  instanceId: number;

  @Column()
  instanceType: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'instanceId' })
  user: User;

  @OneToOne(() => Log)
  @JoinColumn({ name: 'logId' })
  log: Log;
}

