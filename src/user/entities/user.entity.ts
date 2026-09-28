import { Invoice } from '../../invoice/entities/invoice.entity';
import { UserProfile } from './user-profile.entity';
import { UserContact } from './user-contact.entity';
import { UserLocation } from './user-location.entity';
import { Student } from '../../student/entities/student.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { LocationWalkinCustomer } from '../../location/entities/location-walkin-customer.entity';
import { UserEmail } from './user-email.entity';
import { CustomerReferralSources } from '../../customer/entities/customer-referral-sources.entity';
import { Course } from '../../course/entities/course.entity';
import { Blog } from '../../blog/entities/blog.entity';
@Entity('user')
export class User {
  // Status constants matching legacy system
  static readonly STATUS_NOT_ACTIVE = 1;
  static readonly STATUS_ACTIVE = 2;

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  username: string;

  @Column({ type: 'varchar', length: 32 })
  auth_key: string;

  @Column({ type: 'varchar', length: 40 })
  access_token: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password_hash: string;

  @Column({ type: 'char', length: 128, nullable: true })
  pin_hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oauth_client: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oauth_client_user_id: string;

  @Column({ type: 'smallint', default: 2 })
  status: number;

  @Column({ type: 'tinyint', width: 1 })
  canLogin: boolean;

  @Column({ type: 'tinyint', width: 1 })
  canMerge: boolean;

  @Column({ type: 'tinyint', width: 1, unsigned: true })
  isDeleted: boolean;

  @Column({ type: 'int', nullable: true })
  created_at: number;

  @Column({ type: 'int', nullable: true })
  updated_at: number;

  @Column({ type: 'int', nullable: true })
  logged_at: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  login_token: string;

  @OneToMany('RbacAuthAssignment', 'item', { nullable: true })
  roleAssignments: any[];
  
@OneToMany(() => UserContact, contact => contact.user, { cascade: true, eager: true })
contacts: UserContact[];

@OneToMany(() => Student, student => student.user)
students: Student[];

@OneToOne(() => UserProfile, profile => profile.user)
profile: UserProfile;



@OneToOne(() => CustomerAccount, account => account.user)
customerAccount: CustomerAccount;

@OneToOne(() => UserLocation, location => location.user, { cascade: true })
userLocation: UserLocation;

@OneToOne(() => LocationWalkinCustomer, locationWalkin => locationWalkin.user)
locationWalkin: LocationWalkinCustomer;

@OneToOne(() => Invoice, invoice => invoice.user)
invoice: Invoice;

@OneToOne(() => CustomerReferralSources, customerReferralSource => customerReferralSource.user)
customerReferralSource: CustomerReferralSources;

@OneToOne(() => RbacAuthAssignment, auth => auth.user, { cascade: true })
rbacAuthAssignment: RbacAuthAssignment;

@OneToMany(() => Course, course => course.teacher)
courses: Course[];
 
@OneToMany(() => Blog, (blog) => blog.user)
  blog: Blog[];

  /**
   * Get status name based on status code
   * Based on legacy getStatus() method
   */
  static getStatusName(status: number): string {
    switch (status) {
      case User.STATUS_ACTIVE:
        return 'Active';
      case User.STATUS_NOT_ACTIVE:
        return 'Inactive';
      default:
        return 'Unknown';
    }
  }
}
