import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('location_flags')
export class LocationFlags {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'location_slug', type: 'varchar', length: 30 })
  @Index()
  locationSlug: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  dashboard: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  schedule: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  enrolments: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  students: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  customers: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  teachers: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  privateLessons: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  groupCourses: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  unscheduledLessons: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  recurringPayments: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  paymentPreferences: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  invoices: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  payments: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  reports: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  releaseNotes: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  items: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  admin: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  setup: string;

  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  timeline: string;

  // Reports Sub-menu
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  accountReceivable: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  financialSummary: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  birthdays: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  paymentsReport: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  royalty: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  taxCollected: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  royaltyFree: string;
  @Column({
    name: 'reportItems',
    type: 'varchar',
    length: 20,
    default: 'legacy',
  })
  reportItems: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  itemsByCategory: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  discount: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  salesAndPayment: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  allLocations: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  rentals: string;

  // Admin Sub-menu
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  administrators: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  programs: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  cities: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  provinces: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  countries: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  taxes: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  colorCode: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  itemCategory: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  reminderNotes: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  blogs: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  locations: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  holidays: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  emailTemplate: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  testEmail: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  termsOfService: string;
  @Column({ type: 'varchar', length: 20, default: 'modern' })
  teacherDocumentDisclosures: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  referralSources: string;

  // Setup Sub-menu
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  privileges: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  staffMembers: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  owners: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  classrooms: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  import: string;
  @Column({ type: 'varchar', length: 20, default: 'legacy' })
  locationSettings: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
