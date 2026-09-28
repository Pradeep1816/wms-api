import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

export interface GroupEnrolmentPrintData {
  enrolment: Enrolment | null;
  lessons: Lesson[];
  recentCourseSchedule: CourseSchedule | null;
  enrolmentCourseSchedule: CourseSchedule | null;
}

@Injectable()
export class GroupEnrolmentPrintRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
  ) {}

  async getGroupEnrolmentPrintDetail(
    locationId: number,
    enrolmentId: number,
  ): Promise<GroupEnrolmentPrintData> {
    const enrolment = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();

    if (!enrolment) {
      return {
        enrolment: null,
        lessons: [],
        recentCourseSchedule: null,
        enrolmentCourseSchedule: null,
      };
    }

    const recentCourseSchedule = await this.courseScheduleRepository
      .createQueryBuilder('courseSchedule')
      .leftJoinAndSelect('courseSchedule.teacher', 'scheduleTeacher')
      .leftJoinAndSelect('scheduleTeacher.profile', 'scheduleTeacherProfile')
      .where('courseSchedule.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('courseSchedule.isRecent = :isRecent', { isRecent: true })
      .getOne();

    const enrolmentCourseSchedule = await this.courseScheduleRepository
      .createQueryBuilder('courseSchedule')
      .where('courseSchedule.courseId = :courseId', { courseId: enrolment.courseId })
      .orderBy('courseSchedule.id', 'DESC')
      .getOne();

    const lessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin(
        GroupLesson,
        'groupLesson',
        'groupLesson.lessonId = lesson.id AND groupLesson.enrolmentId = :enrolmentId',
        { enrolmentId },
      )
      .where('lesson.courseId = :courseId', { courseId: enrolment.courseId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.date >= :now', { now: new Date() })
      .andWhere('groupLesson.isDeleted = false')
      .orderBy('groupLesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .getMany();

    return {
      enrolment,
      lessons,
      recentCourseSchedule,
      enrolmentCourseSchedule,
    };
  }
}
