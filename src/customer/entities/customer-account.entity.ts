import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';

@Entity('customer_account')
export class CustomerAccount {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'customerId', type: 'int' })
  @Index()
  customerId: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  balance: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  // Relations
  @OneToMany(() => Student, student => student.customerAccount)
  customer: Student[];

  @OneToOne(() => User)
  @JoinColumn({ name: 'customerId' })
  user: User;
}
