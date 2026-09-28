import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('test_email')
export class TestEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column({ name: 'updatedOn', type: 'datetime', nullable: true })
  updatedOn: Date;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: true })
  updatedByUserId: number;
}
