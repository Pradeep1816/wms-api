import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { getCurrentESTDate } from '../../utils/date-utils';
import { Student } from '../entities/student.entity';
import { User } from '../../user/entities/user.entity';
import { Location } from '../../location/entities/location.entity';
import { StudentGender, StudentStatus } from '../enums/student-status.enum';
import { ProgramTypeEnum } from '../../program/enums/program-type';

@Injectable()
export class StudentRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  /**
   * Find location by slug
   */
  async findLocationBySlug(locationSlug: string): Promise<Location | null> {
    return this.locationRepository.findOne({ 
      where: { slug: locationSlug } 
    });
  }

  /**
   * Find customer by ID and location ID
   */
  async findCustomerByIdAndLocation(customerId: number, locationId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('raa.item_name = :role', { role: 'customer' })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
  }

  /**
   * Find student by ID and location ID
   */
  async findStudentByIdAndLocation(
    studentId: number,
    locationId: number,
  ): Promise<Student | null> {
    return this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .where('student.id = :studentId', { studentId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();
  }

  /**
   * Find students by customer ID with pagination
   */
  async findStudentsByCustomerId(
    customerId: number,
    page: number = 1,
    limit: number = 20,
    showActive: boolean = false,
    excludeStudentId?: number,
  ): Promise<{ students: Student[]; total: number }> {
    const query = this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 });

      if (showActive) {
        query.andWhere('student.status = :status', { status: StudentStatus.ACTIVE });
      }

      // Exclude specific student (used for merge modal)
      if (excludeStudentId) {
        query.andWhere('student.id != :excludeStudentId', { excludeStudentId });
      }

    // Get total count
    const total = await query.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    const students = await query
      .skip(offset)
      .take(limit)
      .getMany();

    return { students, total };
  }

  /**
   * Get active students for a given customer 
   */
  async getActiveStudentListByCustomerId(
    customerId: number,
  ): Promise<any> {
    return this.studentRepository
      .createQueryBuilder('student')
      .leftJoin('student.user', 'user')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('student.status = :status', { status: StudentStatus.ACTIVE })
      .select([
        'student.id AS id',
        "CONCAT(student.firstName, ' ', student.lastName) AS fullName",
      ])
      .getRawMany();
  }

  /**
   * Find student by ID with user relations
   */
  async findStudentById(id: number, locationId: number): Promise<any> {
    return this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.contacts', 'contacts', 'contacts.isDeleted = false')
      .leftJoinAndSelect('contacts.phones', 'phones', 'phones.isDeleted = false')
      .leftJoinAndSelect('contacts.emails', 'emails', 'emails.isDeleted = false')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .where('student.id = :id', { id })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .orderBy('contacts.isPrimary', 'DESC')
      .addOrderBy('phones.id', 'ASC')
      .getOne();
  }

  /**
   * Find the first confirmed private course for a student in a location.
   * Mirrors legacy Student::firstPrivateCourse behavior for modal defaults.
   */
  async findFirstPrivateCourseByStudentId(
    studentId: number,
    locationId: number,
  ): Promise<{
    courseId: number;
    programId: number;
    teacherId: number;
    programName?: string;
    teacherName?: string;
  } | null> {
    const result = await this.studentRepository
      .createQueryBuilder('student')
      .innerJoin('student.enrolments', 'enrolment')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('course.teacher', 'teacher')
      .leftJoin('teacher.profile', 'teacherProfile')
      .where('student.id = :studentId', { studentId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('program.type = :privateProgramType', { privateProgramType: ProgramTypeEnum.PRIVATE_PROGRAM })
      .select([
        'course.id AS courseId',
        'course.programId AS programId',
        'course.teacherId AS teacherId',
        'program.name AS programName',
        "CONCAT(COALESCE(teacherProfile.firstname, ''), ' ', COALESCE(teacherProfile.lastname, '')) AS teacherName",
      ])
      .orderBy('enrolment.id', 'ASC')
      .limit(1)
      .getRawOne();

    if (!result) {
      return null;
    }

    return {
      courseId: Number(result.courseId),
      programId: Number(result.programId),
      teacherId: Number(result.teacherId),
      programName: result.programName ?? undefined,
      teacherName: result.teacherName?.trim() || undefined,
    };
  }

  /**
   * Find students by location with filtering and sorting
   * @param locationId - The location ID
   * @param options - Filter and sort options
   * @returns Object with students array and total count
   */
  async getStudentsList(
    locationId: number,
    options: {
      page?: number;
      limit?: number;
      firstName?: string;
      lastName?: string;
      customerName?: string;
      phoneNumber?: string;
      showActive?: boolean;
      showInActive?: boolean;
      showAll?: boolean;
      sort?: 'firstName' | 'lastName' | 'customer' | 'phone';
      order?: 'ASC' | 'DESC';
    } = {},
  ): Promise<{ users: any[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      firstName,
      lastName,
      customerName,
      phoneNumber,
      showActive = false,
      showInActive = false,
      showAll = false,
      sort = 'firstName',
      order = 'ASC',
    } = options;

    const skip = (page - 1) * limit;

    const query = this.studentRepository
      .createQueryBuilder('student')
      .distinct(true)
      .leftJoin('user_profile', 'customerProfile', 'customerProfile.user_id = student.customer_id')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('user.contacts', 'contact', 'contact.isDeleted = 0')
      .leftJoinAndSelect('contact.phones', 'phones', 'phones.isDeleted = 0')
      .leftJoinAndSelect('contact.emails', 'emails', 'emails.isDeleted = 0')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .where('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('userLocation.location_id = :locationId', { locationId });

    this.applySearchFilters(query, { firstName, lastName, customerName, phoneNumber });
    this.applyStatusFilter(query, { showActive, showInActive, showAll });
    this.applySorting(query, sort, order.toUpperCase() as 'ASC' | 'DESC');
    this.applyPagination(query, skip, limit);

    const [students, total] = await query.getManyAndCount();
  
    return { users: students, total };
  }

  /**
   * Apply search filters (firstName, lastName, customerName, phoneNumber)
   */
  private applySearchFilters(
    query: any,
    filters: {
      firstName?: string;
      lastName?: string;
      customerName?: string;
      phoneNumber?: string;
    },
  ): void {
    const normalizedPhoneNumber = filters.phoneNumber?.replace(/\D/g, '');
    const searchFilters = [
      {
        condition: filters.firstName?.trim(),
        query: 'student.firstName LIKE :firstName',
        params: { firstName: `%${filters.firstName?.trim()}%` },
      },
      {
        condition: filters.lastName?.trim(),
        query: 'student.lastName LIKE :lastName',
        params: { lastName: `%${filters.lastName?.trim()}%` },
      },
      {
        condition: filters.customerName?.trim(),
        query: '(customerProfile.firstname LIKE :customerName OR customerProfile.lastname LIKE :customerName OR CONCAT(customerProfile.firstname, \' \', customerProfile.lastname) LIKE :customerName)',
        params: { customerName: `%${filters.customerName?.trim()}%` },
      },
      {
        condition: normalizedPhoneNumber,
        query: "REGEXP_REPLACE(phones.number, '[^0-9]', '') LIKE :phoneNumber",
        params: { phoneNumber: `%${normalizedPhoneNumber}%` },
      },
    ];
     query.orderBy('student.id', 'ASC');
    searchFilters
      .filter((filter) => filter.condition)
      .forEach(({ query: queryString, params }) => {
        query.andWhere(queryString, params);
      });
  }

  /**
   * Apply status filtering based on showActive/showInActive/showAll flags
   */
  private applyStatusFilter(
    query: any,
    filters: { showActive: boolean; showInActive: boolean; showAll: boolean },
  ): void {
    const { showActive, showInActive, showAll } = filters;

    // Explicit filters take priority
    if (showActive && !showInActive) {
      query.andWhere('student.status = :active', { active: StudentStatus.ACTIVE });
      return;
    }

    if (!showActive && showInActive) {
      query.andWhere('student.status = :notActive', { notActive: StudentStatus.INACTIVE });
      return;
    }

    // Default filter when both are false and showAll is false
    if (!showActive && !showInActive && !showAll) {
      query.andWhere('student.status = :active', { active: StudentStatus.ACTIVE });
    }

    // When showAll = true, no status filter is applied
  }

  /**
   * Apply sorting
   */
  private applySorting(query: any, sort: string, order: string): void {
    const sortMapping: Record<string, { field: string; isPhone?: boolean }> = {
      firstName: { field: 'student.firstName' },
      lastName: { field: 'student.lastName' },
      customer: { field: 'userProfile.firstname' },
      phone: { field: 'phones.number', isPhone: true },
    };

    const sortConfig = sortMapping[sort] || sortMapping.firstName;

    if (sortConfig.isPhone) {
      query.orderBy('phones.number', order);
    } else if (sort === 'customer') {
      query.orderBy('userProfile.firstname', order);
    } else {
      query.orderBy(sortConfig.field, order);
    }
  }

  /**
   * Apply pagination
   */
  private applyPagination(query: any, skip: number, limit: number): void {
    query.skip(skip).take(limit);
  }

  /**
   * Create a new student
   * @param studentData - Student data to create
   * @param createdByUserId - User ID who is creating the student
   * @returns The created student
   */
  async createStudent(
    studentData: {
      firstName: string;
      lastName: string;
      customerId: number;
      birthDate?: Date;
      gender?: string;
      mediaAndOnlineLessonConsent?: boolean;
    },
    createdByUserId: number,
  ): Promise<Student> {
    const queryRunner = this.studentRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify customer exists
      const customer = await queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
        .where('user.id = :customerId', { customerId: studentData.customerId })
        .andWhere('raa.item_name = :role', { role: 'customer' })
        .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
        .getRawOne();

      if (!customer) {
        throw new Error(`Customer with ID ${studentData.customerId} not found`);
      }

      // Create student record
      // Map gender: '1' -> '1' (male), '2' -> '2' (female), otherwise -> '0' (not specified)
      // The gender column is NOT NULL varchar, so we use '0' for not specified (matches legacy GENDER_NOT_SPECIFIED = 0)
      const genderValue = (studentData.gender === StudentGender.MALE || studentData.gender === StudentGender.FEMALE) 
        ? studentData.gender 
        : StudentGender.NOT_SPECIFIED;

      const now = getCurrentESTDate();

      // Build student data object, only including birthDate if provided
      const studentDataToCreate: Partial<Student> = {
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        customerId: studentData.customerId,
        gender: genderValue,
        status: StudentStatus.INACTIVE,
        mediaAndOnlineLessonConsent: studentData.mediaAndOnlineLessonConsent,
        isDeleted: 0,
        createdByUserId,
        updatedByUserId: createdByUserId,
        createdOn: now,
        updatedOn: now,
      };

      // Only add birthDate if provided (TypeORM DeepPartial expects undefined, not null)
      if (studentData.birthDate) {
        studentDataToCreate.birthDate = studentData.birthDate;
      }

      const student = queryRunner.manager.create(Student, studentDataToCreate);

      const savedStudent = await queryRunner.manager.save(student);

      await queryRunner.commitTransaction();
      return savedStudent;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Create a student within an existing transaction (e.g. user import).
   * Uses the given status so import can create ACTIVE students without affecting existing createStudent behavior.
   */
  async createStudentInTransaction(
    manager: EntityManager,
    studentData: {
      firstName: string;
      lastName: string;
      customerId: number;
      birthDate?: Date;
      gender?: string;
      status?: number;
    },
    createdByUserId: number,
  ): Promise<Student> {
    const genderValue =
      studentData.gender === StudentGender.MALE || studentData.gender === StudentGender.FEMALE
        ? studentData.gender
        : StudentGender.NOT_SPECIFIED;
    const status = studentData.status ?? StudentStatus.INACTIVE;
    const now = getCurrentESTDate();
    const toCreate: Partial<Student> = {
      firstName: studentData.firstName,
      lastName: studentData.lastName,
      customerId: studentData.customerId,
      gender: genderValue,
      status,
      isDeleted: 0,
      createdByUserId,
      updatedByUserId: createdByUserId,
      createdOn: now,
      updatedOn: now,
    };
    if (studentData.birthDate) {
      toCreate.birthDate = studentData.birthDate;
    }
    const student = manager.create(Student, toCreate);
    return manager.save(Student, student);
  }
}
