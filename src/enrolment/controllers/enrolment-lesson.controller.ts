import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { EnrolmentLessonsResponseDto } from '../dto/enrolment-lesson-response.dto';
import { EnrolmentLessonRequestDto } from '../dto/enrolment-lesson-request.dto';
import { EnrolmentLessonService } from '../services/enrolment-lesson.service';

@Controller('admin/v2/:location/enrolments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class EnrolmentLessonController {
  constructor(
    private readonly enrolmentLessonService: EnrolmentLessonService,
  ) {}

  @Get(':id/lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentLessons(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query(ValidationPipe) query: EnrolmentLessonRequestDto,
  ): Promise<EnrolmentLessonsResponseDto | any> {
    try {
      const result = await this.enrolmentLessonService.getEnrolmentLessons(
        locationId,
        id,
        query,
      );
      return ResponseHelper.success(result, 'Enrolment lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentLessons controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment lessons');
    }
  }
}

