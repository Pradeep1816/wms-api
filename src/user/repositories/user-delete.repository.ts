import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserLocation } from '../entities/user-location.entity';
import { UserContact } from '../entities/user-contact.entity';
import { UserEmail } from '../entities/user-email.entity';
import { Student } from '../../student/entities/student.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { Course } from '../../course/entities/course.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';

@Injectable()
export class UserDeleteRepository {
  // Protected super admin emails (cannot be deleted)
  private static readonly SUPER_ADMIN_EMAILS = [
    'maurizio@arcadiamusicacademy.com',
    'giancarlo@aaom.com',
    'senguttuvang@gmail.com',
  ];

  // For specific roles, enforce location check
  private static readonly ROLES_WITH_LOCATION = [
    RolesEnum.CUSTOMER,
    RolesEnum.TEACHER,
    RolesEnum.STAFFMEMBER,
    RolesEnum.OWNER,
  ];

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
  ) {}

  /**
   * Find user by ID, role, and location
   * @param userId - The user ID
   * @param locationId - The location ID
   * @param role - The role to filter by
   * @returns User if found, null otherwise
   */
  async findUserByIdRoleAndLocation(
    userId: number,
    locationId: number,
    role: RolesEnum,
  ): Promise<User | null> {

    console.log('userId', userId, 'locationId', locationId, 'role', role);
    try {
      const query = this.userRepository
        .createQueryBuilder('user')
        .leftJoin('user.rbacAuthAssignment', 'rbacAuthAssignment')
        .leftJoinAndSelect('user.profile', 'profile')
        .leftJoinAndSelect('user.userLocation', 'userLocation')
        .leftJoin('user.locationWalkin', 'locationWalkin')
        .where('user.id = :userId', { userId })
        .andWhere('rbacAuthAssignment.item_name = :role', { role })
        .andWhere('user.isDeleted = 0')
        .andWhere('locationWalkin.customerId IS NULL');

      

      if (UserDeleteRepository.ROLES_WITH_LOCATION.includes(role as RolesEnum)) {
        query.andWhere('userLocation.locationId = :locationId', { locationId });
      }

      return await query.getOne();
    } catch (error) {
      console.error('Error in findUserByIdRoleAndLocation:', error);
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }

  /**
   * Check if user has any students (active or inactive)
   * @param userId - The user ID
   * @returns True if user has students
   */
  async hasStudents(userId: number): Promise<boolean> {
    try {
      const studentsCount = await this.studentRepository
        .createQueryBuilder('student')
        .where('student.customer_id = :userId', { userId }) 
        .andWhere('student.isDeleted = :isDeleted', { isDeleted: false }) 
        .getCount();

      return studentsCount > 0;
    } catch (error) {
      console.error('Error checking students:', error);
      return false;
    }
  }

  /**
   * Check if user has payments
   * @param userId - The user ID
   * @returns True if user has payments
   */
  async hasPayments(userId: number): Promise<boolean> {
    try {
      const paymentsCount = await this.paymentRepository
        .createQueryBuilder('payment')
        .where('payment.userId = :userId', { userId })
        .andWhere('payment.isDeleted = :isDeleted', { isDeleted: false })
        .getCount();

      return paymentsCount > 0;
    } catch (error) {
      console.error('Error checking payments:', error);
      return false;
    }
  }

  /**
   * Get user's primary email address
   * @param userId - The user ID
   * @returns Email address or null
   */
  async getUserEmail(userId: number): Promise<string | null> {
    try {
      const primaryContact = await this.userContactRepository.findOne({
        where: { userId, isPrimary: true, isDeleted: false },
      });

      if (!primaryContact) {
        return null;
      }

      const primaryEmail = await this.userEmailRepository.findOne({
        where: { userContactId: primaryContact.id, isDeleted: false },
      });

      return primaryEmail?.email || null;
    } catch (error) {
      console.error('Error getting user email:', error);
      return null;
    }
  }

  /**
   * Check if user is a protected super admin
   *  check for ALL roles,
   * @param userId - The user ID
   * @returns True if user is a protected admin
   */
  async isProtectedAdmin(userId: number): Promise<boolean> {
    try {
      const email = await this.getUserEmail(userId);
      if (!email) {
        return false;
      }

      return UserDeleteRepository.SUPER_ADMIN_EMAILS.includes(
        email.toLowerCase(),
      );
    } catch (error) {
      console.error('Error checking protected admin:', error);
      return false;
    }
  }

  /**
   * Check if teacher has qualifications
   * @param teacherId - The teacher ID
   * @returns True if teacher has qualifications
   */
  async hasQualifications(teacherId: number): Promise<boolean> {
    try {
      const qualificationsCount = await this.qualificationRepository
        .createQueryBuilder('qualification')
        .where('qualification.teacher_id = :teacherId', { teacherId }) 
        .andWhere('qualification.isDeleted = :isDeleted', { isDeleted: false })
        .getCount();

      return qualificationsCount > 0;
    } catch (error) {
      console.error('Error checking qualifications:', error);
      return false;
    }
  }

  /**
   * Check if teacher has courses
   * @param teacherId - The teacher ID
   * @returns True if teacher has courses
   */
  async hasCourses(teacherId: number): Promise<boolean> {
    try {
      const coursesCount = await this.courseRepository
        .createQueryBuilder('course')
        .where('course.teacherId = :teacherId', { teacherId })
        .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: true }) 
        .getCount();

      return coursesCount > 0;
    } catch (error) {
      console.error('Error checking courses:', error);
      return false;
    }
  }

  /**
   * Delete a user (soft delete by setting isDeleted = true)
   * @param userId - The ID of the user to delete
   * @param locationId - The ID of the location
   * @param role - The role of the user
   * @returns The deleted user
   * @throws Error if user not found or validation fails
   */
  async deleteUser(
    locationSlug: string,
    userId: number,
    locationId: number,
    role: RolesEnum,
    currentUserId: number,
  ): Promise<User> {
    try {
      // Verify user exists and belongs to the location with the specified role
      const user = await this.findUserByIdRoleAndLocation(userId, locationId, role);

      if (!user) {
        throw new NotFoundException(
          `User with ID ${userId} and role ${role} not found in location ${locationSlug}`,
        );
      }

      //  Check protected admin for ALL roles (not just administrators)
      const isProtected = await this.isProtectedAdmin(userId);
      if (isProtected) {
        throw new Error('Sorry! You can not delete super admins!');
      }

      // Role-specific validation checks 
      switch (role) {
        case RolesEnum.CUSTOMER:
          // Customer: Cannot delete if has students OR payments

          // check students first, then payments only if no students
          const hasStudents = await this.hasStudents(userId);
          if (hasStudents) {
            throw new Error(
              `Unable to delete. There are student(s) associated with this ${role}`,
            );
          } else {
            // Only check payments if no students found 
            const hasPayments = await this.hasPayments(userId);
            if (hasPayments) {
              throw new Error(
                `Unable to delete. There are payments associated with this ${role}`,
              );
            }
          }
          break;

        case RolesEnum.TEACHER:
          // Teacher: Cannot delete if has qualifications AND courses 
          const hasQualifications = await this.hasQualifications(userId);
          const hasCourses = await this.hasCourses(userId);

          if (hasQualifications && hasCourses) {
            throw new Error(
              `Unable to delete. There are qualification/course(s) associated with this ${role}`,
            );
          }
          break;

        case RolesEnum.ADMINISTRATOR:
        case RolesEnum.OWNER:
        case RolesEnum.STAFFMEMBER:
        default:
          // Other roles: No specific checks (staffmember, owner, administrator)
          break;
      }

      // Soft delete the user
      user.isDeleted = true;
      user.updated_at = Math.floor(Date.now() / 1000);

      return await this.userRepository.manager.transaction(async (manager) => {
        if (manager.queryRunner) {
          manager.queryRunner.data = {
            ...(manager.queryRunner.data ?? {}),
            currentUserId,
          };
        }

        return manager.save(User, user);
      });
    } catch (error) {
      console.error('Error in deleteUser repository:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`${error.message}`);
    }
  }
}
