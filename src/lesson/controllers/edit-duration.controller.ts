import { Body, Controller, Put, Req, UseGuards, ValidationPipe, Param } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { EditDurationRequestDto } from '../dto/private-lesson-action-dto/edit-duration-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { EditDurationService } from '../services/private-lesson-actions/edit-duration.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEditDurationController {
  constructor(
    private readonly editDurationService: EditDurationService,
  ) { }

  /**
   * Bulk edit duration for selected private lessons.
   * Matches legacy EditDuration behavior from private lesson listing.
   */
  @Put('edit-duration')
  @Roles(RolesEnum.BACKEND_USER)
  async editDuration(
    @Req() req: any,
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: EditDurationRequestDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const { lessonIds, duration } = body;

      const result = await this.editDurationService.editDuration(
        locationId,
        userId,
        lessonIds,
        duration,
        locationSlug,
      );

      return ResponseHelper.success(
        { updatedLessonIds: lessonIds },
        result.message,
      );
    } catch (error) {
      console.error('Error in editDuration controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to edit duration for lessons',
      );
    }
  }
}
