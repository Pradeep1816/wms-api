import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  UseGuards,
  Param,
  Request,
  ValidationPipe,
  BadRequestException,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { SubstituteLessonDto, SubstituteTeacherLessonRequestDto } from '../dto/teacher-substitute-request.dto';
import { ConfirmSubstituteRequestDto } from '../dto/teacher-substitute-confirm-request.dto';
import { TeacherSubstituteService } from '../services/teacher-substitute.service';

@Controller('admin/v2/:location/teacher-substitute')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherSubstituteController {
  constructor(
    private readonly teacherSubstituteService: TeacherSubstituteService,
  ) {}

  /**
   * Lesson-level substitute teacher (from Group Course Lessons Tab)
   * GET /admin/v2/:location/teacher-substitute/lesson?ids=1,2,3&teacherId=5&resolvingConflicts=false
   */
  @Get('lesson')
  @Roles(RolesEnum.BACKEND_USER)
  async substituteTeacherForLessons(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Request() req: any,
    @Query(ValidationPipe) dto: SubstituteTeacherLessonRequestDto,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;

      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.teacherSubstituteService.substituteTeacherForLessons(
        dto,
        loggedUserId,
        locationSlug,
      );

      // If service indicates failure (e.g., different teachers), return standardized error
      if (result && result.status === false && result.message) {
        return ResponseHelper.error('BAD_REQUEST', result.message);
      }

      // For preview mode (no teacherId), return body structure directly
      if (!dto.teacherId && result.body) {
        return {
          success: true,
          body: result.body,
          message: '',
        };
      }

      // For draft creation mode (with teacherId), use standard response
      return ResponseHelper.success(result, 'Lesson substitution processed');
    } catch (error) {
      console.error('Error in substituteTeacherForLessons controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to process lesson substitution',
      );
    }
  }

  /**
   * Confirm substitute teacher changes
   * PUT /admin/v2/:location/teacher-substitute/confirm
   * Body: { "ids": [1, 2, 3], "newLessonIds": [10, 11, 12] }
   * ids = original lesson IDs (request order). newLessonIds = draft lesson IDs in same order (ids[i] pairs with newLessonIds[i]).
   */
  @Put('confirm')
  @Roles(RolesEnum.BACKEND_USER)
  async confirmSubstitute(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Request() req: any,
    @Body(ValidationPipe) dto: ConfirmSubstituteRequestDto,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;

      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.teacherSubstituteService.confirmSubstitute(
        dto,
        loggedUserId,
        locationSlug,
      );

      // Service returns only URL; wrap with standard success + message
      return ResponseHelper.success(
        result,
        'Lessons are substituted to the selected teachers',
      );
    } catch (error) {
      console.error('Error in confirmSubstitute controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if(error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to confirm substitution',
      );
    }
  }
  // update draft lesson date and duration
  @Post('draft-lesson/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async substituteDraftLesson(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) dto: SubstituteLessonDto,
  ): Promise<any> {
    try {
      const result = await this.teacherSubstituteService.updateDraftLessonDate(lessonId, locationId, dto);
      return ResponseHelper.success(result, 'Draft lesson date updated successfully');
    } catch (error) {
      console.error('Error in updateDraftLessonDate controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message);
    }
  }
}
