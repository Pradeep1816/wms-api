import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Location } from '../../location/entities/location.entity';
import { Student } from '../../student/entities/student.entity';
import { UserLocation } from '../../user/entities/user-location.entity';

export interface StudentStatusCronLocation {
  id: number;
  name: string;
}

export interface StudentStatusCronCounts {
  locationsProcessed: number;
  activeStudents: number;
  inactiveStudents: number;
  totalStudentsUpdated: number;
  locationsFailed: number;
}

@Injectable()
export class StudentStatusCronRepository {
  private readonly activeStudentStatus = 1;
  private readonly inactiveStudentStatus = 2;
  private readonly confirmedValue = 1;
  private readonly notDeletedValue = 0;

  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async getLocationsByCronEnabled(
    isEnabledCron: boolean,
  ): Promise<StudentStatusCronLocation[]> {
    return this.locationRepository
      .createQueryBuilder('location')
      .select(['location.id AS id', 'location.name AS name'])
      .where('location.isEnabledCron = :isEnabledCron', { isEnabledCron })
      .orderBy('location.id', 'ASC')
      .getRawMany<StudentStatusCronLocation>();
  }

  async getActiveStudentIdsForLocation(
    locationId: number,
    currentDateTime: string,
  ): Promise<number[]> {
    const rows = await this.buildActiveStudentsQuery(
      locationId,
      currentDateTime,
    )
      .select('student.id', 'id')
      .distinct(true)
      .getRawMany<{ id: number | string }>();

    return rows.map((row) => Number(row.id));
  }

  async getInactiveStudentIdsForLocation(
    locationId: number,
    activeStudentIds: number[],
  ): Promise<number[]> {
    const query = this.buildScopedStudentsQuery(locationId)
      .select('student.id', 'id')
      .distinct(true);

    if (activeStudentIds.length > 0) {
      query.andWhere('student.id NOT IN (:...activeStudentIds)', {
        activeStudentIds,
      });
    }

    const rows = await query.getRawMany<{ id: number | string }>();
    return rows.map((row) => Number(row.id));
  }

  async updateStudentsStatus(
    studentIds: number[],
    status: number,
    botUserId: number,
    updatedOn: string,
  ): Promise<void> {
    if (studentIds.length === 0) {
      return;
    }

    await this.studentRepository
      .createQueryBuilder()
      .update(Student)
      .set({
        status,
        updatedByUserId: botUserId,
        updatedOn: updatedOn as unknown as Date,
      })
      .whereInIds(studentIds)
      .execute();
  }

  getActiveStatusValue(): number {
    return this.activeStudentStatus;
  }

  getInactiveStatusValue(): number {
    return this.inactiveStudentStatus;
  }

  private buildScopedStudentsQuery(
    locationId: number,
  ): SelectQueryBuilder<Student> {
    return this.studentRepository
      .createQueryBuilder('student')
      .innerJoin(
        UserLocation,
        'userLocation',
        'userLocation.userId = student.customerId AND userLocation.locationId = :locationId',
        { locationId },
      )
      .where('student.isDeleted = :studentDeleted', {
        studentDeleted: this.notDeletedValue,
      });
  }

  private buildActiveStudentsQuery(
    locationId: number,
    currentDateTime: string,
  ): SelectQueryBuilder<Student> {
    return this.buildScopedStudentsQuery(locationId)
      .innerJoin(
        Enrolment,
        'enrolment',
        [
          'enrolment.studentId = student.id',
          'enrolment.isDeleted = :enrolmentDeleted',
          'enrolment.isConfirmed = :enrolmentConfirmed',
          'enrolment.studentId IS NOT NULL',
        ].join(' AND '),
        {
          enrolmentDeleted: this.notDeletedValue,
          enrolmentConfirmed: this.confirmedValue,
        },
      )
      .innerJoin(
        Course,
        'course',
        'course.id = enrolment.courseId ' +
          'AND course.isDeleted = :courseDeleted ' +
          'AND course.isConfirmed = :courseConfirmed ' +
          'AND course.type = :courseType ' +
          'AND (' +
          'DATE(course.startDate) BETWEEN :fromDateTime AND :toDateTime ' +
          'OR DATE(course.endDate) BETWEEN :fromDateTime AND :toDateTime ' +
          'OR (DATE(course.startDate) < :fromDateTime AND DATE(course.endDate) > :toDateTime)' +
          ')',
        {
          courseDeleted: this.notDeletedValue,
          courseConfirmed: this.confirmedValue,
          courseType: Course.TYPE_REGULAR,
          fromDateTime: currentDateTime,
          toDateTime: currentDateTime,
        },
      )
      .innerJoin(
        Lesson,
        'lesson',
        [
          'lesson.courseId = course.id',
          'lesson.isDeleted = :lessonDeleted',
          'lesson.isConfirmed = :lessonConfirmed',
          'lesson.status IN (:...lessonStatuses)',
        ].join(' AND '),
        {
          lessonDeleted: this.notDeletedValue,
          lessonConfirmed: this.confirmedValue,
          lessonStatuses: [
            LessonStatusEnum.RESCHEDULED,
            LessonStatusEnum.SCHEDULED,
            LessonStatusEnum.UNSCHEDULED,
          ],
        },
      );
  }
}
