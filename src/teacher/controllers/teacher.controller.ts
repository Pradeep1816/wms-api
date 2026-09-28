import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, ValidationPipe, BadRequestException, NotFoundException, Req } from '@nestjs/common';
import { TeacherService } from '../services/teacher.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationService } from '../../location/services/location.service';
import { TeacherQualificationService } from '../services/teacher-qualification.service';
import { CustomerValidationService } from 'src/shared/services/customer-validation.service';
import { TeacherQualificationRequestDto } from '../dto/teacher-qualification-request.dto';
import { QualificationTypeEnum } from '../enums/qualification-type.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { TeacherByProgramRequestDto } from '../dto/teacher-by-program-request.dto';
import { CreateTeacherQualificationDto } from '../dto/create-teacher-qualification.dto';
import { UpdateTeacherQualificationDto } from '../dto/update-teacher-qualification.dto';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherController {
  constructor(
    private readonly teacherService: TeacherService,
    private readonly locationService: LocationService,
    private readonly teacherQualificationService: TeacherQualificationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeachersList(
    @Param('location') location: string,
  ) {
    try {
      // Get location ID from location slug
      const locationId = await this.locationService.getLocationId(location);
      
      const teachers = await this.teacherService.findTeachersByLocation(locationId);
      return ResponseHelper.success(teachers, 'Teachers retrieved successfully');
    } catch (error) {
      console.error('Error in getTeachersList controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teachers');
    }
  }

  @Get('by-program')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeachersByProgram(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TeacherByProgramRequestDto,
  ) {
    try {
         
      const teachers = await this.teacherService.findTeachersByLocationAndProgram(
        locationId,
        query.programId,
      );

      return ResponseHelper.success(teachers, 'Teachers retrieved successfully');
    } catch (error) {
      console.error('Error in getTeachersByProgram controller:', error);
      
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teachers');
    }
  }

  @Get(':id/qualifications')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherQualifications(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query(ValidationPipe) query: TeacherQualificationRequestDto,
  ) {
    try {
      // Validate location and teacher(user) exist
      await this.validationService.validateLocationAndCustomer(
        locationSlug,
        id,
      );

      const result = await this.teacherQualificationService.getTeacherQualifications(
        id,
        query,
      );

      const typeLabel = query.type === QualificationTypeEnum.PRIVATE ? 'Private' : 'Group';
      return ResponseHelper.success(result, `${typeLabel} qualifications retrieved successfully`);
    } catch (error) {
      console.error('Error in getTeacherQualifications controller:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher qualifications');
    }
  }

  @Post(':id/qualifications')
  @Roles(RolesEnum.BACKEND_USER)
  async createTeacherQualifications(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query('type') type: string,
    @Body(ValidationPipe) body: CreateTeacherQualificationDto,
    @Req() req: any,
  ) {
    try {
      // Validate location and teacher(user) exist
      await this.validationService.validateLocationAndCustomer(
        locationSlug,
        id,
      );

      // Parse and validate type parameter
      const typeNumber = parseInt(type, 10);
      if (isNaN(typeNumber) || (typeNumber !== QualificationTypeEnum.PRIVATE && typeNumber !== QualificationTypeEnum.GROUP)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid type parameter. Must be 1 (private) or 2 (group)');
      }

      const qualificationType = typeNumber as QualificationTypeEnum;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      const result = await this.teacherQualificationService.createTeacherQualifications(
        id,
        body,
        qualificationType,
        userId,
      );

      const typeLabel = qualificationType === QualificationTypeEnum.PRIVATE ? 'Private' : 'Group';
      const message = result.created > 0 && result.updated > 0
        ? `${typeLabel} qualifications created successfully (${result.created} created, ${result.updated} updated)`
        : result.created > 0
        ? `${typeLabel} qualifications created successfully (${result.created} created)`
        : `${typeLabel} qualifications updated successfully (${result.updated} updated)`;

      return ResponseHelper.success(result, message);
    } catch (error) {
      console.error('Error in createTeacherQualifications controller:', error);
      
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to create teacher qualifications');
    }
  }

  @Put(':id/qualifications/:qualificationId')
  @Roles(RolesEnum.BACKEND_USER)
  async updateTeacherQualification(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Param('qualificationId') qualificationId: number,
    @Body(ValidationPipe) body: UpdateTeacherQualificationDto,
    @Req() req: any,
  ) {
    try {
      // Validate location and teacher(user) exist
      await this.validationService.validateLocationAndCustomer(
        locationSlug,
        id,
      );

      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      await this.teacherQualificationService.updateTeacherQualification(
        qualificationId,
        body,
        userId,
      );

      return ResponseHelper.successMessage('Qualification updated successfully');
    } catch (error) {
      console.error('Error in updateTeacherQualification controller:', error);
      
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to update teacher qualification');
    }
  }

  @Delete(':id/qualifications/:qualificationId')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteTeacherQualification(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Param('qualificationId') qualificationId: number,
    @Req() req: any,
  ) {
    try {
      // Validate location and teacher(user) exist
      await this.validationService.validateLocationAndCustomer(
        locationSlug,
        id,
      );

      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      await this.teacherQualificationService.deleteTeacherQualification(
        qualificationId,
        userId,
      );

      return ResponseHelper.successMessage('Qualification deleted successfully');
    } catch (error) {
      console.error('Error in deleteTeacherQualification controller:', error);
      
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to delete teacher qualification');
    }
  }
  
}
