import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LogLink } from './log-link.entity';
import { LogHistory } from './log-history.entity';
import { User } from '../../user/entities/user.entity';

@Entity('log')
export class Log {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column()
  logObjectId: number;

  @Column()
  logActivityId: number;

  @Column()
  message: string;

  @Column()
  data: string;

  @Column()
  locationId: number;

  @Column()
  createdOn: Date;

  @Column()
  createdUserId: number;

  @OneToMany(() => LogLink, logLink => logLink.log)
  logLinks: LogLink[];

  @OneToOne(() => LogHistory, logHistory => logHistory.log)
  logHistory: LogHistory;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdUserId' })
  createdUser: User;

  content: any;
}