import { Controller, Post, Param, Body, Query, UseGuards, ValidationPipe, Request } from '@nestjs/common';
import { PrivateLessonCreateService } from '../services/private-lesson-create.service';
import { CreatePrivateLessonRequestDto } from '../dto/create-private-lesson-request.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/extra-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class ExtraLessonController {
  constructor(
    private readonly privateLessonCreateService: PrivateLessonCreateService,
  ) {}

  /**
   * Create private lesson (extra lesson)
   */
  @Post('create-private')
  @Roles(RolesEnum.BACKEND_USER)
  async createPrivate(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Query('studentId') studentId: string,
    @Body(ValidationPipe) body: CreatePrivateLessonRequestDto,
    @Request() req: any,
  ): Promise<any> {
    try {
      const studentIdNumber = parseInt(studentId, 10);
      if (isNaN(studentIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid studentId parameter');
      }

      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      const result = await this.privateLessonCreateService.createPrivateLesson(
        locationSlug,
        locationId,
        studentIdNumber,
        body,
        loggedUserId,
      );

      if (result.success) {
        return ResponseHelper.success(result.data, result.message || 'Private lesson created successfully');
      } else {
        // Return validation errors in the format expected by frontend
        return {
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: result.message || 'Failed to create private lesson',
          data: result.errors,
        };
      }
    } catch (error) {
      console.error('Error in createPrivate controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to create private lesson');
    }
  }
}

