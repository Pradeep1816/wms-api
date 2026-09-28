import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GroupCourseListRepository } from '../repositories/group-course-list.repository';
import { GroupCourseSearchDto } from '../dto/group-course-list-request.dto';
import { GroupCourseListDataDto } from '../dto/group-course-list-response.dto';
import { GroupCourseListTransformationService } from './transformation/group-course-list-transformation.service';

@Injectable()
export class GroupCourseListService {
  constructor(
    private readonly groupCourseListRepository: GroupCourseListRepository,
    private readonly transformationService: GroupCourseListTransformationService,
  ) {}

  async getGroupCourses(
    locationId: number,
    searchDto: GroupCourseSearchDto,
  ): Promise<GroupCourseListDataDto> {
    try {
      const { page = 1, limit = 20, showAll = false } = searchDto;

      const { courses, total } =
        await this.groupCourseListRepository.getGroupCourses(
          locationId,
          searchDto,
        );

      // When showAll is true, set limit to total for correct pagination info
      const effectiveLimit = showAll ? total : limit;
      const effectivePage = showAll ? 1 : page;

      // Transform results using transformation service
      return this.transformationService.transformCoursesData(
        courses,
        total,
        effectivePage,
        effectiveLimit,
      );
    } catch (error) {
      console.error('Error in getGroupCourses service:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve group courses: ${error.message}`,
      );
    }
  }
}
