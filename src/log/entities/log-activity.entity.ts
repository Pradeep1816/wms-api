import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('log_activity')
export class LogActivity {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}