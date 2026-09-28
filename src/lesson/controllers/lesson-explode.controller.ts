import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Param,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { LessonExplodeService } from '../services/private-lesson-actions/lesson-explode.service';
import { LessonExplodeRequestDto } from '../dto/private-lesson-action-dto/lesson-explode.dto';

/**
 * Controller for lesson explode (split) operations
 * Legacy: PrivateLessonController::actionSplit()
 * 
 * Endpoints:
 * - POST /admin/v2/:location/lesson/explode - Explode lessons into 15-min segments
 * - GET /admin/v2/:location/lesson/explode/status - Check if lessons can be exploded
 */
@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonExplodeController {
  constructor(
    private readonly lessonExplodeService: LessonExplodeService,
  ) {}

  @Post('explode/:lessonId')
  @Roles(RolesEnum.BACKEND_USER)
  async explodeLessonSingle(
    @Req() req: any,
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const results = await this.lessonExplodeService.explodeLessons(
        locationId,
        { lessonIds: [lessonId] },
        userId,
      );

      const result = results[0];
      
      const redirectUrl = result.studentId 
        ? `/admin/v2/${locationSlug}/students/${result.studentId}`
        : undefined;

      return ResponseHelper.success(
        { 
          ...result,
          redirectUrl,
        },
        'Lesson exploded successfully',
      );
    } catch (error: any) {
      console.error('Error in explodeLessonSingle controller:', error);
      
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to explode lesson',
      );
    }
  }

  /**
   * Check if lessons can be exploded
   * Returns status for each lesson ID
   * 
   * Query params: lessonIds[] - Array of lesson IDs to check
   */
  @Get('explode/status')
  @Roles(RolesEnum.BACKEND_USER)
  async getExplodeStatus(
    @LocationId() locationId: number,
    @Query(new ValidationPipe({ transform: true })) dto: LessonExplodeRequestDto,
  ): Promise<any> {
    try {
       console.log('Explode status for lessons', dto.lessonIds);
      const status = await this.lessonExplodeService.getExplodeStatus(dto.lessonIds);

      console.log('Explode status for lessons', dto.lessonIds, status);

      return ResponseHelper.success(
        { status },
        'Explode status retrieved successfully',
      );
    } catch (error: any) {
      console.error('Error in getExplodeStatus controller:', error);
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to get explode status',
      );
    }
  }

  // /**
  //  * Check if a single lesson can be exploded
  //  * Legacy: Lesson::canExplode() check
  //  * 
  //  * Query params: lessonId - Single lesson ID to check
  //  */
  // @Get('explode/can-explode')
  // @Roles(RolesEnum.BACKEND_USER)
  // async canExplode(
  //   @LocationId() locationId: number,
  //   @Query('lessonId', ParseIntPipe) lessonId: number,
  // ): Promise<any> {
  //   try {
  //     const status = await this.lessonExplodeService.canExplode(lessonId);

  //     return ResponseHelper.success(
  //       status,
  //       status.canExplode 
  //         ? 'Lesson can be exploded' 
  //         : `Lesson cannot be exploded: ${status.reason}`,
  //     );
  //   } catch (error: any) {
  //     console.error('Error in canExplode controller:', error);
  //     return ResponseHelper.error(
  //       'BAD_REQUEST',
  //       error.message || 'Failed to check explode eligibility',
  //     );
  //   }
  // }
}
