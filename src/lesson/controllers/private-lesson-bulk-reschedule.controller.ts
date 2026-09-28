import {
  Body,
  Controller,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { PrivateLessonBulkRescheduleService } from '../services/private-lesson-actions/private-lesson-bulk-reschedule.service';
import { PrivateLessonBulkRescheduleDto } from '../dto/private-lesson-action-dto/private-lesson-bulk-reschedule.dto';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonBulkRescheduleController {
  constructor(
    private readonly bulkRescheduleService: PrivateLessonBulkRescheduleService,
  ) {}

  /**
   * Bulk reschedule private lessons to a new date.
   * Legacy-identical behavior to old PrivateLessonBulkRescheduleService.
   */
  @Put('bulk-reschedule')
  @Roles(RolesEnum.BACKEND_USER)
  async bulkReschedule(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: PrivateLessonBulkRescheduleDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.bulkRescheduleService.bulkReschedule(
        locationId,
        body,
        userId,
      );

      return ResponseHelper.success(
        { rescheduledLessons: result.rescheduledLessons },
        result.message || 'Lesson has been rescheduled successfully.',
      );
    } catch (error: any) {
      console.error('Error in bulkReschedule controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to bulk reschedule lessons',
      );
    }
  }
}

