import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { PrivateLessonListService } from '../services/private-lesson-list.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { PrivateLessonListRequestDto } from '../dto/private-lesson-list-request.dto';
import { PrivateLessonListDataDto } from '../dto/private-lesson-list-response.dto';

@Controller('admin/v2/:location/private-lessons')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonListController {
  constructor(
    private readonly privateLessonListService: PrivateLessonListService,
  ) {}

 
  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrivateLessons(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: PrivateLessonListRequestDto,
  ): Promise<PrivateLessonListDataDto | any> {
    try {
      const result = await this.privateLessonListService.getPrivateLessons(
        locationId,
        query,
      );

      return ResponseHelper.success(result, 'Private lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getPrivateLessons controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve private lessons',
      );
    }
  }
}
