import {
  Body,
  Controller,
  Get,
  Put,
  Query,
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
import { GetReasonsToUnscheduleResponseDto, LessonUnscheduleDto } from '../dto/private-lesson-action-dto/lesson-unschedule-request.dto';
import { LessonUnscheduleService } from '../services/private-lesson-actions/lesson-unschedule.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonUnscheduleController {
  constructor(
    private readonly LessonUnscheduleService: LessonUnscheduleService,
  ) { }

  @Get('reason-to-unschedule')
  @Roles(RolesEnum.BACKEND_USER)
  async getReasonsToUnschedule(
   @LocationId() locationId: number,
  ): Promise<GetReasonsToUnscheduleResponseDto|any> {
    try {
      const result = await this.LessonUnscheduleService.getReasonsToUnschedule();
      return ResponseHelper.success(result, 'Reasons to unschedule retrieved successfully');
    } catch (error: any) {
      console.error('Error in getReasonsToUnschedule controller:', error);
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to get reasons to unschedule',
      );
    }
  }

  @Put('unschedule')
  @Roles(RolesEnum.BACKEND_USER)
  async unschedule(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: LessonUnscheduleDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.LessonUnscheduleService.unscheduleLessons(
        locationId,
        body,
        userId,
      );

      return ResponseHelper.success(
        { lessonIds: body.lessonIds },
        result.message || 'Lessons unscheduled successfully',
      );
    } catch (error: any) {
      console.error('Error in unschedule controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to unschedule lessons',
      );
    }
  }
}
