import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Log } from './log.entity';

@Entity('log_link')
export class LogLink {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    @Column()
    logId: number;

    @Column()
    index: string;

    @Column()
    baseUrl: string;

    @Column()
    path: string;

    @ManyToOne(() => Log, log => log.logLinks)
    @JoinColumn({ name: 'logId' })
    log: Log;
}