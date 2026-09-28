import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Snapshot of imported student/customer row from CSV.
 * Legacy table: student_csv
 */
@Entity('student_csv')
export class StudentCsv {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'studentId' })
  studentId: number;

  @Column({ name: 'firstName', type: 'varchar', length: 255, nullable: true })
  firstName: string;

  @Column({ name: 'lastName', type: 'varchar', length: 255, nullable: true })
  lastName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  province: string;

  @Column({ name: 'postalCode', type: 'varchar', length: 255, nullable: true })
  postalCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  country: string;

  @Column({ name: 'homeTel', type: 'varchar', length: 255, nullable: true })
  homeTel: string;

  @Column({ name: 'otherTel', type: 'varchar', length: 255, nullable: true })
  otherTel: string;

  @Column({ name: 'birthDate', type: 'varchar', length: 255, nullable: true })
  birthDate: string;

  @Column({ name: 'billingFirstName', type: 'varchar', length: 255, nullable: true })
  billingFirstName: string;

  @Column({ name: 'billingLastName', type: 'varchar', length: 255, nullable: true })
  billingLastName: string;

  @Column({ name: 'billingEmail', type: 'varchar', length: 255, nullable: true })
  billingEmail: string;

  @Column({ name: 'billingAddress', type: 'varchar', length: 255, nullable: true })
  billingAddress: string;

  @Column({ name: 'billingCity', type: 'varchar', length: 255, nullable: true })
  billingCity: string;

  @Column({ name: 'billingProvince', type: 'varchar', length: 255, nullable: true })
  billingProvince: string;

  @Column({ name: 'billingPostalCode', type: 'varchar', length: 255, nullable: true })
  billingPostalCode: string;

  @Column({ name: 'billingCountry', type: 'varchar', length: 255, nullable: true })
  billingCountry: string;

  @Column({ name: 'billingHomeTel', type: 'varchar', length: 255, nullable: true })
  billingHomeTel: string;

  @Column({ name: 'billingOtherTel', type: 'varchar', length: 255, nullable: true })
  billingOtherTel: string;

  @Column({ name: 'billingWorkTel', type: 'varchar', length: 255, nullable: true })
  billingWorkTel: string;

  @Column({ name: 'billingWorkTelExt', type: 'varchar', length: 255, nullable: true })
  billingWorkTelExt: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'openingBalance', type: 'varchar', length: 255, nullable: true })
  openingBalance: string;
}
