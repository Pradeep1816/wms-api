import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseIntPipe,
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
import { TeacherBulkRescheduleRequestDto } from '../dto/teacher-bulk-reschedule-request.dto';
import { TeacherBulkRescheduleService } from '../services/teacher-bulk-reschedule.service';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherBulkRescheduleController {
  constructor(
    private readonly teacherBulkRescheduleService: TeacherBulkRescheduleService,
  ) {}

  @Put(':id/bulk-reschedule')
  @Roles(RolesEnum.BACKEND_USER)
  async bulkRescheduleByTeacher(
    @Req() req: any,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) teacherId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: TeacherBulkRescheduleRequestDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result =
        await this.teacherBulkRescheduleService.bulkRescheduleByTeacher(
          locationId,
          teacherId,
          body,
          userId,
        );

      return ResponseHelper.success(
        { rescheduledLessons: result.rescheduledLessons },
        result.message || 'Lesson has been rescheduled successfully.',
      );
    } catch (error: any) {
      console.error('Error in teacher bulk reschedule controller:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to bulk reschedule lessons',
      );
    }
  }
}
