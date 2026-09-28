import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CourseExtra } from '../entities/course-extra.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Program } from '../../program/entities/program.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

@Injectable()
export class CourseDeleteRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseExtra)
    private readonly courseExtraRepository: Repository<CourseExtra>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find course by ID with program relation
   * @param courseId - Course ID
   * @param locationId - Location ID for validation
   */
  async findCourseById(courseId: number, locationId: number): Promise<Course | null> {
    return await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.program', 'program')
      .where('course.id = :courseId', { courseId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Check if course has confirmed enrolments
   */
  async hasConfirmedEnrolment(courseId: number): Promise<boolean> {
    const count = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .where('enrolment.courseId = :courseId', { courseId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .getCount();

    return count > 0;
  }

  /**
   * Check if program is a group program
   */
  async isGroupProgram(programId: number): Promise<boolean> {
    const program = await this.dataSource.getRepository(Program).findOne({
      where: { id: programId },
      select: ['id', 'type'],
    });

    return program?.type === Program.TYPE_GROUP_PROGRAM;
  }

  /**
   * Find all CourseExtra records for a course (not deleted)
   */
  async findCourseExtras(courseId: number): Promise<CourseExtra[]> {
    return await this.courseExtraRepository
      .createQueryBuilder('courseExtra')
      .leftJoinAndSelect('courseExtra.extraCourse', 'extraCourse')
      .where('courseExtra.courseId = :courseId', { courseId })
      .andWhere('courseExtra.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  /**
   * Find all lessons for a course
   */
  async findCourseLessons(courseId: number): Promise<Lesson[]> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
        ],
      })
      .getMany();
  }

  /**
   * Soft delete a lesson (set isDeleted = true)
   */
  async softDeleteLesson(lessonId: number, userId: number): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      {
        isDeleted: true,
        updatedOn: new Date(),
        updatedByUserId: userId,
      },
    );
  }

  /**
   * Soft delete a CourseExtra record (set isDeleted = true)
   */
  async softDeleteCourseExtra(courseExtraId: number): Promise<void> {
    await this.courseExtraRepository.update(
      { id: courseExtraId },
      { isDeleted: true },
    );
  }

  /**
   * Soft delete a course (set isDeleted = true)
   */
  async softDeleteCourse(courseId: number, userId: number): Promise<void> {
    await this.courseRepository.update(
      { id: courseId },
      {
        isDeleted: true,
        updatedOn: new Date(),
        updatedByUserId: userId,
      },
    );
  }

  /**
   * Execute the complete delete operation
   * 1. Delete extra course lessons (soft)
   * 2. Delete extra courses (soft)
   * 3. Delete all lessons (soft)
   * 4. Delete course (soft)
   */
  async executeDeleteTransaction(courseId: number, userId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Find and delete extra courses with their lessons
      const extraCourses = await this.findCourseExtras(courseId);
      
      for (const extraCourse of extraCourses) {
        // Delete lessons of the extra course
        if (extraCourse.extraCourse) {
          const extraCourseLessons = await this.findCourseLessons(extraCourse.extraCourseId);
          for (const lesson of extraCourseLessons) {
            await queryRunner.manager.update(
              Lesson,
              { id: lesson.id },
              {
                isDeleted: true,
                updatedOn: new Date(),
                updatedByUserId: userId,
              },
            );
          }
        }

        // Delete the CourseExtra record
        await queryRunner.manager.update(
          CourseExtra,
          { id: extraCourse.id },
          { isDeleted: true },
        );
      }

      // 2. Delete all lessons of the main course
      const courseLessons = await this.findCourseLessons(courseId);
      for (const lesson of courseLessons) {
        await queryRunner.manager.update(
          Lesson,
          { id: lesson.id },
          {
            isDeleted: true,
            updatedOn: new Date(),
            updatedByUserId: userId,
          },
        );
      }

      // 3. Delete the course
      await queryRunner.manager.update(
        Course,
        { id: courseId },
        {
          isDeleted: true,
          updatedOn: new Date(),
          updatedByUserId: userId,
        },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
