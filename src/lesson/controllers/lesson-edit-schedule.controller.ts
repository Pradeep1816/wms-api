import {
  Body,
  Controller,
  Put,
  Param,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LessonEditScheduleRequestDto } from '../dto/lesson-edit-schedule-request.dto';
import { LessonEditScheduleService } from '../services/lesson-edit-schedule.service';
import { LocationId } from '../../shared/decorators/location-id.decorator';
@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonEditScheduleController {
  constructor(
    private readonly editScheduleService: LessonEditScheduleService,
  ) {}

  /**
   * Edit schedule for a lesson (private or group).
  */
  @Put('edit-schedule/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async editSchedule(
    @LocationId() locationId: number,
    @Req() req: any,
    @Param('location') locationSlug: string,
    @Param('id') id: string,
    @Body(ValidationPipe) body: LessonEditScheduleRequestDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const lessonId = parseInt(id, 10);
      if (isNaN(lessonId)) {
        return ResponseHelper.error('BAD_REQUEST', 'Invalid lesson id');
      }

      const result = await this.editScheduleService.editSchedule(
        locationSlug,
        locationId,
        lessonId,
        body,
        userId,
      );

      return ResponseHelper.success(result,'Lesson schedule updated successfully');
    } catch (error: any) {
      console.error('Error in LessonEditScheduleController:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      if (error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to edit lesson schedule',
      );
    }
  }
}
