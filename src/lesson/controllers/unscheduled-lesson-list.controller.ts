import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UnscheduledLessonListService } from '../services/unscheduled-lesson-list.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { UnscheduledLessonListRequestDto } from '../dto/unscheduled-lesson-list-request.dto';
import { UnscheduledLessonListDataDto } from '../dto/unscheduled-lesson-list-response.dto';

@Controller('admin/v2/:location/unscheduled-lessons')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UnscheduledLessonListController {
  constructor(
    private readonly unscheduledLessonListService: UnscheduledLessonListService,
  ) {}

  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getUnscheduledLessons(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: UnscheduledLessonListRequestDto,
  ): Promise<UnscheduledLessonListDataDto | any> {
    try {
      const result = await this.unscheduledLessonListService.getUnscheduledLessons(
        locationId,
        query,
      );

      return ResponseHelper.success(result, 'Unscheduled lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getUnscheduledLessons controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve unscheduled lessons',
      );
    }
  }
}

