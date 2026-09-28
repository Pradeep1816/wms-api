import { Controller, Get, NotFoundException, BadRequestException, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { TeacherStudentsService } from '../services/teacher-students.service';
import { TeacherStudentsRequestDto } from '../dto/teacher-students-request.dto';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard,LocationResolveGuard)
export class TeacherStudentsController {
  constructor(
    private readonly teacherStudentsService: TeacherStudentsService,
  ) {}

  @Get(':id/students')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherStudents(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string, // This is only for showing in the error message
    @Param('id') id: number,
    @Query(ValidationPipe) query: TeacherStudentsRequestDto,
  ) {
    try {
      const students = await this.teacherStudentsService.getTeacherStudents(
        locationSlug,
        locationId,
        id,
        query,
      );

      return ResponseHelper.success(students, 'Teacher students retrieved successfully');
    } catch (error) {
      console.error('Error in teacher students controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher students');
    }
  }
}

