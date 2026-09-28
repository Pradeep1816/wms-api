import { Controller, Put, Param, Body, UseGuards, ValidationPipe, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LessonAttendanceService } from '../services/lesson-attendance.service';
import { UpdateAttendanceRequestDto } from '../dto/update-attendance-request.dto';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonAttendanceController {
  constructor(
    private readonly lessonAttendanceService: LessonAttendanceService,
  ) {}

  //Update lesson attendance (isPresent field)

  @Put(':id/attendance')
  @Roles(RolesEnum.BACKEND_USER)
  async updateAttendance(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) body: UpdateAttendanceRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      const lessonIdNumber = parseInt(lessonId.toString(), 10);
      if (isNaN(lessonIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid lessonId parameter');
      }

      // Call service to update attendance
      const result = await this.lessonAttendanceService.updateAttendance(
        locationId,
        lessonIdNumber,
        body.present,
        userId,
      );

      return ResponseHelper.success(result, 'Attendance updated successfully');
    } catch (error) {
      console.error('Error in updateAttendance controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to update attendance');
    }
  }
}
