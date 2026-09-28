import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { StudentPrivateLessonsResponseDto, StudentGroupLessonsDataDto } from '../dto/student-lessons-response.dto';
import { StudentAbsentLessonsDataDto } from '../dto/student-absent-lessons-response.dto';
import { StudentUnscheduledLessonsDataDto } from '../dto/student-unscheduled-lessons-response.dto';
import { StudentUnscheduledLessonsRequestDto } from '../dto/student-unscheduled-lessons-request.dto';
import { StudentGroupLessonsRequestDto } from '../dto/student-group-lessons-request.dto';
import { StudentPrivateLessonsService } from '../services/student-lessons.service';
import { StudentAbsentLessonsService } from '../services/student-absent-lessons.service';
import { StudentUnscheduledLessonsService } from '../services/student-unscheduled-lessons.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/student')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class StudentPrivateLessonsController {
  constructor(
    private readonly studentPrivateLessonsService: StudentPrivateLessonsService,
    private readonly studentAbsentLessonsService: StudentAbsentLessonsService,
    private readonly studentUnscheduledLessonsService: StudentUnscheduledLessonsService,
  ) {}

  @Get(':id/private-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrivateLessonsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
  ): Promise<StudentPrivateLessonsResponseDto | any> {
    try {
      const result = await this.studentPrivateLessonsService.getPrivateLessonsByStudentId(
        locationId,
        locationSlug,
        studentId,
      );
      return ResponseHelper.success(result, 'Student private lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getPrivateLessonsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student private lessons');
    }
  }

  @Get(':id/group-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query(ValidationPipe) query: StudentGroupLessonsRequestDto,
  ): Promise<StudentGroupLessonsDataDto | any> {
    try {
      const { page = 1, limit = 10 } = query;

      const result = await this.studentPrivateLessonsService.getGroupLessonsByStudentId(
        locationId,
        locationSlug,
        studentId,
        page,
        limit,
      );
      return ResponseHelper.success(result, 'Student group lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupLessonsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student group lessons');
    }
  }

  @Get(':id/absent-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getAbsentLessonsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<StudentAbsentLessonsDataDto | any> {
    try {
      const result = await this.studentAbsentLessonsService.getAbsentLessonsByStudentId(
        locationId,
        locationSlug,
        studentId,
        Number(page) || 1,
        Number(limit) || 10,
      );
      return ResponseHelper.success(result, 'Student absent lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getAbsentLessonsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student absent lessons');
    }
  }

  @Get(':id/unscheduled-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getUnscheduledLessonsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query(ValidationPipe) query: StudentUnscheduledLessonsRequestDto,
  ): Promise<StudentUnscheduledLessonsDataDto | any> {
    try {
      const { page = 1, limit = 10, showAll = false } = query;
      
      const result = await this.studentUnscheduledLessonsService.getUnscheduledLessonsByStudentId(
        locationId,
        locationSlug,
        studentId,
        page,
        limit,
        showAll,
      );
      return ResponseHelper.success(result, 'Student unscheduled lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getUnscheduledLessonsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student unscheduled lessons');
    }
  }
}
