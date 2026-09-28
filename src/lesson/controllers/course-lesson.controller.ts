import { Controller, Post, Body, UseGuards, ValidationPipe, Request, Param } from '@nestjs/common';
import { LessonChangeService } from '../services/lesson-change.service';
import { ChangeLessonRequestDto } from '../dto/change-lesson-request.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/course')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class CourseLessonController {
  constructor(
    private readonly lessonChangeService: LessonChangeService,
  ) {}

  /**
   * Change group lessons to private extra lessons
   */
  @Post('change')
  @Roles(RolesEnum.BACKEND_USER)
  async changeLessons(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: ChangeLessonRequestDto,
    @Request() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      // Validate lesson IDs from request body
      if (!body.lessonIds || !Array.isArray(body.lessonIds) || body.lessonIds.length === 0) {
        return ResponseHelper.errors.BAD_REQUEST('Lesson IDs are required');
      }

      const result = await this.lessonChangeService.changeLessons(
        locationSlug,
        locationId,
        body.lessonIds,
        body,
        loggedUserId,
      );

      if (result.success) {
        return ResponseHelper.success(result.data, result.message || 'Lessons successfully changed');
      } else {
        return {
          success: false,
          errorCode: result.errorCode || 'VALIDATION_ERROR',
          message: result.message || 'Failed to change lessons',
          errors: result.errors,
        };
      }
    } catch (error) {
      console.error('Error in changeLessons controller:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to change lessons');
    }
  }
}

