import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from '../../student/entities/student.entity';

@Entity('equipment_rentals')
export class EquipmentRental {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'customerId', type: 'int' })
  @Index()
  customerId: number;

  @Column({ name: 'studentId', type: 'int' })
  @Index()
  studentId: number;

  @Column({ name: 'startDate', type: 'date', nullable: true })
  startDate: Date;

  @Column({ name: 'returnDate', type: 'date', nullable: true })
  returnDate: Date | null;

  @Column({ name: 'endDate', type: 'date', nullable: true })
  endDate: Date;

  @Column({ type: 'int', nullable: true })
  duration: number | null;

  @Column({ name: 'isOnGoing', type: 'tinyint', width: 1 })
  isOnGoing: boolean;

  @Column({ name: 'securityDeposit', type: 'tinyint', width: 1 })
  securityDeposit: boolean;

  @Column({ name: 'tenderType', type: 'int', nullable: true })
  tenderType: number | null;

  @Column({ name: 'depositAmount', type: 'decimal', precision: 10, scale: 4, nullable: true })
  depositAmount: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  hst: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  total: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: 0 })
  isDeleted: boolean;

  @Column({ name: 'isReturned', type: 'tinyint', width: 1, default: 0 })
  isReturned: boolean;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  // Relations
  @ManyToOne(() => Student, student => student.equipmentRentals)
  @JoinColumn({ name: 'studentId' })
  student: Student;
}
