import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Course } from '../entities/course.entity';
import { GroupCourseSearchDto } from '../dto/group-course-list-request.dto';
import { Program } from '../../program/entities/program.entity';
import { CourseType } from '../enums/course-type';

export interface GroupCourseListResult {
  courses: Course[];
  total: number;
}

@Injectable()
export class GroupCourseListRepository {
  private static readonly SORT_MAPPING: Record<string, string> = {
    course: 'program.name',
    teacher: 'teacherProfile.firstname',
    rate: 'program.rate',
    startDate: 'course.startDate',
    endDate: 'course.endDate',
  };

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  async getGroupCourses(
    locationId: number,
    searchDto: GroupCourseSearchDto,
  ): Promise<GroupCourseListResult> {
    const {
      page = 1,
      limit = 20,
      sort = 'course',
      order = 'ASC',
      showAllCourses = false,
      showAll = false,
    } = searchDto;

    try {
      const query = this.buildBaseQuery(locationId);

      this.applyActiveCoursesFilter(query, showAllCourses);
      this.applySearchFilter(query, searchDto.query);
      this.applySorting(query, sort, order);

      // Get total count before pagination
      const total = await query.getCount();

      // Apply pagination only if showAll is false
      if (!showAll) {
        const skip = (page - 1) * limit;
        query.skip(skip).take(limit);
      }

      const courses = await query.getMany();

      return { courses, total };
    } catch (error) {
      console.error('Error in getGroupCourses repository:', error);
      throw new Error(
        `Failed to fetch group courses for location ${locationId}: ${error.message}`,
      );
    }
  }

  private buildBaseQuery(locationId: number): SelectQueryBuilder<Course> {
    return (
      this.courseRepository
        .createQueryBuilder('course')
        .innerJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('course.teacher', 'teacher')
        .leftJoinAndSelect('teacher.profile', 'teacherProfile')
        .leftJoinAndSelect(
          'course.courseSchedule',
          'courseSchedule',
          'courseSchedule.isRecent = :isRecent',
          { isRecent: true },
        )
        .leftJoinAndSelect('course.courseProgramRates', 'courseProgramRate')
        .where('course.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: 1 })
        .andWhere('course.type = :courseType', { courseType: CourseType.REGULAR })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('program.type = :programType', {
          programType: Program.TYPE_GROUP_PROGRAM,
        })
    ); // groupProgram()
  }

  /**
   * Apply active courses filter based on showAllCourses flag
   */
  private applyActiveCoursesFilter(
    query: SelectQueryBuilder<Course>,
    showAllCourses: boolean,
  ): void {
    if (!showAllCourses) {
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      query.andWhere('course.endDate >= :currentDate', { currentDate });
    }
  }

  /**
   * Apply search filter (query parameter)
   */
  private applySearchFilter(
    query: SelectQueryBuilder<Course>,
    searchQuery: string | undefined,
  ): void {
    if (!searchQuery?.trim()) {
      return;
    }

    const searchTerm = `%${searchQuery.trim()}%`;

    query.andWhere(
      new Brackets((qb) => {
        qb.where('program.name LIKE :searchTerm', { searchTerm })
          .orWhere('teacherProfile.firstname LIKE :searchTerm', { searchTerm })
          .orWhere('teacherProfile.lastname LIKE :searchTerm', { searchTerm });
      }),
    );
  }

  /**
   * Apply sorting
   */
  private applySorting(
    query: SelectQueryBuilder<Course>,
    sort: string,
    order: string,
  ): void {
    const sortField =
      GroupCourseListRepository.SORT_MAPPING[sort] || 'program.name';
    const sortOrder: 'ASC' | 'DESC' =
      order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    query.orderBy(sortField, sortOrder);

    // Add secondary sort for consistent ordering
    if (sort !== 'startDate') {
      query.addOrderBy('course.startDate', 'ASC');
    }
  }
}

