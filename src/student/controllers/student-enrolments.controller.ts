import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { StudentEnrolmentsRequestDto } from '../dto/student-enrolments-request.dto';
import { StudentEnrolmentsResponseDto, StudentEnrolmentDto } from '../dto/student-enrolments-response.dto';
import { StudentEnrolmentService } from '../services/student-enrolment.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CreateStudentEnrolmentDto } from '../dto/create-student-enrolment.dto';

@Controller('admin/v2/:location/student')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class StudentEnrolmentsController {
  constructor(
    private readonly studentEnrolmentService: StudentEnrolmentService,
  ) {}

  @Get(':id/enrolments')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query(ValidationPipe) query: StudentEnrolmentsRequestDto,
  ): Promise<StudentEnrolmentsResponseDto | any> {
    try {
      const result = await this.studentEnrolmentService.getEnrolmentsByStudentId(
        locationId,
        locationSlug,
        studentId,
        query,
      );
      return ResponseHelper.success(result, 'Student enrolments retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student enrolments');
    }
  }

  @Post(':id/enrolments')
  @Roles(RolesEnum.BACKEND_USER)
  async createEnrolment(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Body(ValidationPipe) createDto: CreateStudentEnrolmentDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      
      const result: StudentEnrolmentDto = await this.studentEnrolmentService.createEnrolment(
        locationId,
        locationSlug,
        studentId,
        createDto,
        loggedUserId,
      );
      
      return ResponseHelper.success(result, 'Student enrolment created successfully');
    } catch (error) {
      console.error('Error in createEnrolment controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      // The exception type, not a substring of its message. The service raises
      // BadRequestException for things a person can act on - a missing pricing
      // tier, an invalid day - and matching on the words "not found" and
      // "Invalid" swallowed anything phrased differently into a generic 500,
      // so the reader was told the server broke rather than what to fix.
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create student enrolment');
    }
  }
}
