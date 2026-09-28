import { Controller, Get, Put, Post, Param, Body, UseGuards, ValidationPipe, Req, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { StudentService } from '../services/student.service';
import { StudentUpdateService } from '../services/student-update.service';
import { StudentMergeService } from '../services/student-merge.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ApiResponse } from 'src/shared/interceptors/response.interceptor';
import { StudentDetailsResponseDto } from '../dto/student-info-response.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { MergeStudentDto } from '../dto/merge-student-request.dto';
import { StudentDeleteService } from '../services/student-delete.service';
import { CreateStudentDto } from '../dto/create-student.dto';

@Controller('admin/v2/:location/student')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class StudentInfoController {
  constructor(
    private readonly studentService: StudentService,
    private readonly studentUpdateService: StudentUpdateService,
    private readonly studentMergeService: StudentMergeService,
    private readonly studentDeleteService: StudentDeleteService,
  ) {}

  @Get(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getStudentInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
  ): Promise<StudentDetailsResponseDto | any> {
    try {
      const data = await this.studentService.getStudentDetailsById(id, locationId, locationSlug);

      return ResponseHelper.success(data, 'Student details retrieved successfully');
    } catch (error) {
      console.error('Error in getStudentInfo controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve student details');
    }
  }

  @Put(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async updateStudentInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateStudentDto,
    @Req() req: any,
  ): Promise<ApiResponse<any> | any> {
    try {
      const userId = req.user?.id;
      const data = await this.studentUpdateService.updateStudentById(
        id,
        locationId,
        locationSlug,
        updateDto,
        userId,
      );

      return ResponseHelper.success(data, 'Student details updated successfully');
    } catch (error) {
      console.error('Error in updateStudentInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('No valid fields')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to update student details');
    }
  }

  @Post(':id/merge')
  @Roles(RolesEnum.BACKEND_USER)
  async mergeStudents(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Body(ValidationPipe) mergeDto: MergeStudentDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      const data = await this.studentMergeService.mergeStudents(
          mergeDto.sourceId,
          id,
          locationId,
          locationSlug,
          userId,
      );

      return ResponseHelper.success(data, 'Students merged successfully');
    } catch (error) {
      console.error('Error in mergeStudents controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('Cannot merge') || error.message.includes('must be') || error.message.includes('already deleted') || error.message.includes('cannot be')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to merge students');
    }
  }
  @Delete(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteStudent(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      const result = await this.studentDeleteService.deleteStudentById(
        id,
        locationId,
        locationSlug,
        userId,
      );


      return ResponseHelper.success(
        {
         id: result.id,
         deletedByUserId: result.deletedByUserId,
         url: `/admin/v2/${locationSlug}/students`
        },
        'Student deleted successfully');
    } catch (error) {
      console.error('Error in deleteStudent controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('Unable to delete')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to delete student');
    }
  }

  /**
   * Create a new student 
   */
  @Post('create')
  @Roles(RolesEnum.BACKEND_USER)
  async createStudent(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Query('userId', ParseIntPipe) userId: number,
    @Body(ValidationPipe) createDto: CreateStudentDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;

      // Set customerId from query parameter (userId)
      createDto.customerId = userId;

      const result = await this.studentService.createStudent(
        locationSlug,
        locationId,
        createDto,
        loggedUserId,
      );

      // Return response matching legacy format
      return ResponseHelper.success(
        {
          status: true,
          url: result.url,
        },
        'Student created successfully'
      );
    } catch (error) {
      console.error('Error in createStudent controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message && (error.message.includes('validation') || error.message.includes('required'))) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to create student');
    }
  }
}
