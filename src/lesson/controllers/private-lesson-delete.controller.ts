import {
  Controller,
  Delete,
  Param,
  Body,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { PrivateLessonDeleteService } from '../services/private-lesson-actions/private-lesson-delete.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { DeletePrivateLessonDto } from '../dto/private-lesson-action-dto/delete-private-lesson.dto';

@Controller('admin/v2/:location/private-lessons')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonDeleteController {
  constructor(
    private readonly privateLessonDeleteService: PrivateLessonDeleteService,
  ) { }

  /**
   * Delete private lessons (soft delete).
   * Accepts lessonIds in request body.
   */
  @Delete('delete')
  @Roles(RolesEnum.BACKEND_USER)
  async deletePrivateLessons(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Body(ValidationPipe) dto: DeletePrivateLessonDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const loggedUserId = currentUser?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.privateLessonDeleteService.deleteLessons(
        locationSlug,
        locationId,
        dto,
        loggedUserId,
      );

      return ResponseHelper.success(
        { url: result.url },
        result.message || 'Lesson has been deleted successfully!',
      );

    } catch (error) {

      console.error('Error in deletePrivateLessons controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR',
        error.message || 'Failed to delete private lessons',
      );
    }
  }
}
