import { Injectable, BadRequestException } from '@nestjs/common';
import { LessonRepository } from '../repositories/lesson.repository';
import { LocationService } from '../../location/services/location.service';
import { TeacherQualificationRepository } from 'src/qualification/repositories/teacher-qualification.repository';
import { Course } from 'src/course/entities/course.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Validator to ensure a teacher is eligible to teach a lesson's program
 * (mirrors legacy TeacherEligibleValidator behavior).
 *
 * This is intentionally generic and reusable across lesson flows.
 */
@Injectable()
export class TeacherEligibilityValidator {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly locationService: LocationService,
    private readonly teacherQualificationRepository: TeacherQualificationRepository,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) { }

  /**
   * Validate if a teacher is eligible to teach the given lesson at the given location.
   *
   * - Resolves lesson + course + program.
   * - Resolves locationId from slug.
    * - Delegates to TeacherQualificationRepository.isTeacherEligibleForProgram(...)
   *   which already mirrors legacy qualification logic.
   *
   * Throws BadRequestException when the teacher is not eligible.
   */
  async validateTeacherEligibility(
    teacherId: number,
    lessonId: number,
    locationId: number,
  ): Promise<void> {
  
    // Load lesson with course + program using existing repository helper
    const lesson = await this.courseRepository.createQueryBuilder('course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.lessons', 'lessons')
      .where('lessons.id = :lessonId', { lessonId })
      .andWhere('lessons.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .select([
        'course.id',
        'course.programId',
        'program.id',
        'program.name',
      ])
      .getOne();

    if (!lesson) {
      throw new BadRequestException('Lesson not found');
    }

    const programId = lesson.programId;
    const programName = lesson.program?.name || '';

    if (!programId) {
      // If there is no program tied to the course, we cannot meaningfully
      // check qualification; treat as not found for validation purposes.
      throw new BadRequestException('Program not found for this lesson');
    }

    // Repository returns a Qualification when the teacher IS qualified, null otherwise
    const isEligible =
      await this.teacherQualificationRepository.isTeacherEligibleForProgram(
        programId,
        locationId,
      );

    if (!isEligible.includes(teacherId)) {
      throw new BadRequestException(
        `Please choose an eligible teacher who is qualified to teach ${programName}!`,
      );
    }
  }
}

