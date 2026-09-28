import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Student } from '../../student/entities/student.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';

@Injectable()
export class TeacherScheduleRepository {
  constructor(
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Student)
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(CalendarEventColor)
    private readonly calendarEventColorRepository: Repository<CalendarEventColor>,
  ) {}

  async findCoursesWithSchedulesByTeacher(
    teacherId: number,
    locationId: number,
  ): Promise<Course[]> {
    try {
      return await this.courseRepository
        .createQueryBuilder('course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('course.courseSchedule', 'courseSchedule', 'courseSchedule.isRecent = :isRecent', { isRecent: true })
        .where('course.teacherId = :teacherId', { teacherId })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
        .orderBy('course.startDate', 'DESC')
        .getMany();
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findCoursesWithSchedulesByTeacher:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher courses with schedules');
    }
  }

  async findUpcomingLessonsByTeacher(
    teacherId: number,
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<Lesson[]> {
    try {
      return await this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('lesson.teacher', 'teacher')
        .leftJoinAndSelect('lesson.classroom', 'classroom')
        .leftJoinAndSelect('course.enrolments', 'enrolment', 'enrolment.isDeleted = false')
        .leftJoinAndSelect('enrolment.student', 'student', 'student.isDeleted = 0')
        .leftJoinAndSelect('lesson.lessonHierarchy', 'hierarchy')
        .leftJoinAndSelect('hierarchy.lesson', 'rootLesson')
        .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
        .where('lesson.teacherId = :teacherId', { teacherId })
        .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
        .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
        .andWhere('lesson.status IN (:...statuses)', { statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED] })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
        .andWhere('DATE(lesson.date) >= :startDate', { startDate })
        .andWhere('DATE(lesson.date) <= :endDate', { endDate })
        .orderBy('lesson.date', 'ASC')
        .addOrderBy('lesson.id', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findUpcomingLessonsByTeacher:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher upcoming lessons');
    }
  }

  /**
   * Find all calendar event colors
   */
  async findCalendarEventColors(): Promise<CalendarEventColor[]> {
    try {
      return await this.calendarEventColorRepository.find();
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findCalendarEventColors:', error);
      throw new InternalServerErrorException('Failed to retrieve calendar event colors');
    }
  }

  /**
   * Find enrolments with students for given course IDs
   */
  async findEnrolmentsWithStudentsByCourseIds(courseIds: number[]): Promise<Enrolment[]> {
    try {
      if (courseIds.length === 0) {
        return [];
      }
      return await this.enrolmentRepository.find({
        where: { courseId: In(courseIds), isDeleted: false },
        relations: ['student'],
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findEnrolmentsWithStudentsByCourseIds:', error);
      throw new InternalServerErrorException('Failed to retrieve enrolments');
    }
  }

  /**
   * Find enrolments by course IDs
   */
  async findEnrolmentsByCourseIds(courseIds: number[]): Promise<Enrolment[]> {
    try {
      if (courseIds.length === 0) {
        return [];
      }
      return await this.enrolmentRepository.find({
        where: { courseId: In(courseIds), isDeleted: false },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findEnrolmentsByCourseIds:', error);
      throw new InternalServerErrorException('Failed to retrieve enrolments');
    }
  }

  /**
   * Find customer accounts by customer IDs
   */
  async findCustomerAccountsByCustomerIds(customerIds: number[]): Promise<CustomerAccount[]> {
    try {
      if (customerIds.length === 0) {
        return [];
      }
      return await this.customerAccountRepository.find({
        where: { customerId: In(customerIds) },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findCustomerAccountsByCustomerIds:', error);
      throw new InternalServerErrorException('Failed to retrieve customer accounts');
    }
  }

  /**
   * Find equipment rentals by student IDs
   */
  async findEquipmentRentalsByStudentIds(studentIds: number[]): Promise<EquipmentRental[]> {
    try {
      if (studentIds.length === 0) {
        return [];
      }
      return await this.equipmentRentalRepository.find({
        where: {
          studentId: In(studentIds),
          isDeleted: false,
          isReturned: false,
        },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findEquipmentRentalsByStudentIds:', error);
      throw new InternalServerErrorException('Failed to retrieve equipment rentals');
    }
  }

  /**
   * Find user profiles by user IDs
   */
  async findUserProfilesByUserIds(userIds: number[]): Promise<UserProfile[]> {
    try {
      if (userIds.length === 0) {
        return [];
      }
      return await this.userProfileRepository.find({
        where: { userId: In(userIds) },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findUserProfilesByUserIds:', error);
      throw new InternalServerErrorException('Failed to retrieve user profiles');
    }
  }

  /**
   * Find users by user IDs
   */
  async findUsersByUserIds(userIds: number[]): Promise<User[]> {
    try {
      if (userIds.length === 0) {
        return [];
      }
      return await this.userRepository.find({
        where: { id: In(userIds) },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findUsersByUserIds:', error);
      throw new InternalServerErrorException('Failed to retrieve users');
    }
  }

  /**
   * Get enrolment counts grouped by course ID
   */
  async getEnrolmentCountsByCourseIds(courseIds: number[]): Promise<Array<{ courseId: number; count: number }>> {
    try {
      if (courseIds.length === 0) {
        return [];
      }
      const enrolmentCounts = await this.enrolmentRepository
        .createQueryBuilder('enrolment')
        .select(['enrolment.courseId', 'COUNT(enrolment.id) as count'])
        .where('enrolment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('enrolment.isDeleted = false')
        .groupBy('enrolment.courseId')
        .getRawMany();

      return enrolmentCounts.map((result) => ({
        courseId: result.enrolment_courseId,
        count: parseInt(result.count),
      }));
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.getEnrolmentCountsByCourseIds:', error);
      throw new InternalServerErrorException('Failed to retrieve enrolment counts');
    }
  }

  /**
   * Find first lesson for a course
   */
  async findFirstLessonByCourseId(courseId: number): Promise<Lesson | null> {
    try {
      return await this.lessonRepository.findOne({
        where: {
          courseId: courseId,
          isDeleted: false,
          status: Not(4), // STATUS_CANCELED
        },
        order: {
          date: 'ASC',
        },
      });
    } catch (error) {
      console.error('Error in TeacherScheduleDetailsRepository.findFirstLessonByCourseId:', error);
      return null;
    }
  }
}
