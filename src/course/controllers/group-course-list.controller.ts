import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { GroupCourseListService } from '../services/group-course-list.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { GroupCourseSearchDto } from '../dto/group-course-list-request.dto';
import { GroupCourseListDataDto } from '../dto/group-course-list-response.dto';

@Controller('admin/v2/:location/course')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class GroupCourseListController {
  constructor(
    private readonly groupCourseListService: GroupCourseListService,
  ) {}

  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupCourses(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: GroupCourseSearchDto,
  ): Promise<GroupCourseListDataDto | any> {
    try {
      const result = await this.groupCourseListService.getGroupCourses(
        locationId,
        query,
      );

      return ResponseHelper.success(result, 'Group courses retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupCourses controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve group courses',
      );
    }
  }
}

