import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, ValidationPipe, Req, Put } from '@nestjs/common';
import { StudentEvaluationRequestDto } from '../dto/student-evaluation-request.dto';
import { CreateStudentEvaluationDto } from '../dto/create-student-evaluation.dto';
import { UpdateStudentEvaluationDto } from '../dto/update-student-evaluation.dto';
import { StudentEvaluationsResponseDto } from '../dto/student-evaluation-response.dto';
import { StudentEvaluationService } from '../services/student-evaluation.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/student')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class StudentEvaluationController {
  constructor(
    private readonly studentEvaluationService: StudentEvaluationService,
  ) {}

  @Get(':id/evaluations')
  @Roles(RolesEnum.BACKEND_USER)
  async getEvaluationsByStudentId(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query(ValidationPipe) query: StudentEvaluationRequestDto,
  ): Promise<StudentEvaluationsResponseDto | any> {
    try {
      const result = await this.studentEvaluationService.getEvaluationsByStudentId(
        locationId,
        locationSlug,
        studentId,
        query,
      );
      return ResponseHelper.success(result, 'Student evaluations retrieved successfully');
    } catch (error) {
      console.error('Error in getEvaluationsByStudentId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve student evaluations');
    }
  }

  @Post(':id/evaluations')
  @Roles(RolesEnum.BACKEND_USER)
  async createEvaluation(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Body(ValidationPipe) createDto: CreateStudentEvaluationDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      const result = await this.studentEvaluationService.createEvaluation(
        locationId,
        locationSlug,
        studentId,
        createDto,
        loggedUserId,
      );
      return ResponseHelper.success(result, 'Student evaluation created successfully');
    } catch (error) {
      console.error('Error in createEvaluation controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create student evaluation');
    }
  }

  @Put(':id/evaluations')
  @Roles(RolesEnum.BACKEND_USER)
  async updateEvaluation(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query('evaluationId') evaluationId: number,
    @Body(ValidationPipe) updateDto: UpdateStudentEvaluationDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      const result = await this.studentEvaluationService.updateEvaluation(
        locationId,
        locationSlug,
        studentId,
        evaluationId,
        updateDto,
        loggedUserId,
      );
      return ResponseHelper.success(result, 'Student evaluation updated successfully');
    } catch (error) {
      console.error('Error in updateEvaluation controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('does not belong')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update student evaluation');
    }
  }

  @Delete(':id/evaluations')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteEvaluation(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') studentId: number,
    @Query('evaluationId') id: number,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      const result = await this.studentEvaluationService.deleteEvaluation(
        locationId,
        locationSlug,
        studentId,
        id,
        loggedUserId,
      );
      return ResponseHelper.success(result, 'Student evaluation deleted successfully');
    } catch (error) {
      console.error('Error in deleteEvaluation controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('does not belong')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete student evaluation');
    }
  }
}
