import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { Student } from '../../student/entities/student.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { LessonStatusEnum } from '../enums/lesson-status';

@Injectable()
export class PrivateLessonRepository {
  constructor(
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
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
   * Get private lessons by customer ID with pagination
   */
  async getPrivateLessonsByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ privateLessons: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString(); 

    const [lessons, total] = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoinAndSelect('lesson.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .innerJoinAndSelect('course.enrolments', 'enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'userProfile')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :userId', { userId: customerId })
      .andWhere('program.type = :privateType', { privateType: ProgramTypeEnum.PRIVATE_PROGRAM })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('privateLesson.balance > 0')
      .andWhere('DATE(lesson.date) >= :today', { today })
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('lesson.date >= :now', { now }) 
      .orderBy('lesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { privateLessons: lessons, total };
  }

  /**
   * Get private lessons paid by a specific payment ID
   * Reusable query for payment view
   */
  async getLessonsByPaymentId(
    paymentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ lessons: any[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const baseQuery = () => this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson_payment', 'lp', 'lp.lessonId = lesson.id AND lp.paymentId = :paymentId AND lp.isDeleted = 0', { paymentId })
      .innerJoin('private_lesson', 'pl', 'pl.lessonId = lesson.id')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('enrolment', 'e', 'e.id = lp.enrolmentId')
      .leftJoin('student', 's', 's.id = e.studentId')
      .leftJoin('user', 'u', 'u.id = lesson.teacherId')
      .leftJoin('user_profile', 'up', 'up.user_id = u.id')
      .where('lesson.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId });

    const [lessons, total] = await Promise.all([
      baseQuery()
        .select('lesson.id', 'id')
        .addSelect('lesson.originalDate', 'originalDate')
        .addSelect('lesson.date', 'date')
        .addSelect('lp.amount', 'paymentAmount')
        .addSelect('pl.total', 'amount')
        .addSelect('pl.balance', 'balance')
        .addSelect("CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))", 'studentName')
        .addSelect('program.name', 'programName')
        .addSelect("CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, ''))", 'teacherName')
        .skip(offset)
        .take(limit)
        .getRawMany(),
      baseQuery().getCount(),
    ]);

    return { lessons, total };
  }

  /**
   * Get private lessons by student ID
     */
  async getPrivateLessonsByStudentId(
    studentId: number,
    locationId: number,
  ): Promise<any[]> {
    const now = new Date().toISOString();

    const lessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoinAndSelect('lesson.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .innerJoinAndSelect('course.enrolments', 'enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('student.id = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :privateType', { privateType: ProgramTypeEnum.PRIVATE_PROGRAM })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED] 
      })
      .andWhere('lesson.date >= :now', { now })
      .orderBy('lesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .limit(12)
      .getMany();

    return lessons;
  }
}
