import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('reasons_to_unschedule')
export class ReasonsToUnschedule {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  reason: string;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: false })
  updatedByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: false })
  isDeleted: boolean;
}
