import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { StudentEvaluationRequestDto } from '../dto/student-evaluation-request.dto';
import { CreateStudentEvaluationDto } from '../dto/create-student-evaluation.dto';
import { UpdateStudentEvaluationDto } from '../dto/update-student-evaluation.dto';
import { StudentEvaluationsDataDto, StudentEvaluationDto } from '../dto/student-evaluation-response.dto';
import { EvaluationStudentRepository } from '../../evaluation/repositories/evaluation-student.repository';
import { StudentEvaluationTransformationService } from './transformations/student-evaluation-transformation.service';
import { LogStudentService } from '../../log/services/log-student.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';

@Injectable()
export class StudentEvaluationService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly evaluationStudentRepository: EvaluationStudentRepository,
    private readonly studentEvaluationTransformationService: StudentEvaluationTransformationService,
    private readonly logStudentService: LogStudentService,
  ) {}

  /**
   * Get evaluations by student ID
   */
  async getEvaluationsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
    query: StudentEvaluationRequestDto,
  ): Promise<StudentEvaluationsDataDto> {
    try {
      // Verify student exists in this location
      const student = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);
      if (!student) {
        throw new NotFoundException(`student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Get evaluations with pagination and sorting
      const { evaluations, total } = await this.evaluationStudentRepository.getEvaluationsByStudentId(
        studentId,
        query.page,
        query.limit,
        query.sort,
        query.order as 'ASC',
      );

      // Transform evaluations to DTOs
      const { page = 1, limit = 10 } = query;
      const evaluationsData = this.studentEvaluationTransformationService.transformEvaluationsData(
        evaluations,
        total,
        page,
        limit,
      );

      return evaluationsData;
    } catch (error) {
      console.error('Error in getEvaluationsByStudentId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student evaluations: ${error.message}`);
    }
  }

  /**
   * Create a new evaluation for a student
   */
  async createEvaluation(
    locationId: number,
    locationSlug: string,
    studentId: number,
    createDto: CreateStudentEvaluationDto,
    loggedUserId?: number,
  ): Promise<StudentEvaluationDto> {
    try {
      // Verify student exists in this location
      const student = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);
      if (!student) {
        throw new NotFoundException(`student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Create evaluation (repository handles validation and returns with relations)
      const createdEvaluation = await this.evaluationStudentRepository.createEvaluation(createDto, studentId);

      if (!createdEvaluation) {
        throw new BadRequestException('Failed to create evaluation');
      }

      // Create evaluation log
      if (loggedUserId) {
        const studentName = `${student.firstName} ${student.lastName}`;
        const programName = `${createdEvaluation?.program?.name || 'Unknown Program'}`;
        
        this.logStudentService.createStudentLog({
          action: LogActivityType.TYPE_CREATE,
          studentId,
          studentName,
          loggedUserId,
          locationId,
          locationSlug,
          data: createDto,
          programName,
        }).then(() => {
          console.log(`Evaluation log created successfully for student: ${studentName}`);
        }).catch(error => {
          console.error(`Failed to create evaluation log for student: ${studentName}`, error.message);
        });
      }

      // Transform and return
      return this.studentEvaluationTransformationService.transformEvaluationToDto(createdEvaluation);
    } catch (error) {
      console.error('Error in createEvaluation service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create student evaluation: ${error.message}`);
    }
  }

  /**
   * Delete evaluation by ID
   */
  async deleteEvaluation(
    locationId: number,
    locationSlug: string,
    studentId: number,
    id: number,
    loggedUserId?: number,
  ): Promise<any> {
    try {
      // Verify student exists in this location
      const student = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);
      if (!student) {
        throw new NotFoundException(`student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Verify evaluation exists and belongs to this student
      const evaluation = await this.evaluationStudentRepository.findEvaluationById(id);
      if (!evaluation) {
        throw new NotFoundException(`Evaluation with ID ${id} not found`);
      }

      if (evaluation.studentId !== studentId) {
        throw new BadRequestException(`Evaluation does not belong to student ${studentId}`);
      }

      // Delete evaluation (soft delete)
      await this.evaluationStudentRepository.deleteEvaluation(id);
       
      // Prepare data for log
      const data = {...evaluation};
      // Create delete evaluation log
      if (loggedUserId) {
        const studentName = `${student.firstName} ${student.lastName}`;
        const programName = `${evaluation?.program?.name || 'Unknown Program'}`;

        this.logStudentService.createStudentLog({
          action: LogActivityType.TYPE_DELETE,
          studentId,
          studentName,
          loggedUserId,
          locationId,
          locationSlug,
          data,
          programName,
        }).then(() => {
          console.log(`Evaluation log deleted successfully for student: ${studentName}`);
        }).catch(error => {
          console.error(`Failed to create delete evaluation log for student: ${studentName}`, error.message);
        });
      }

      return {
        id: evaluation.id,
        studentId: evaluation.studentId,
      };
    } catch (error) {
      console.error('Error in deleteEvaluation service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete student evaluation: ${error.message}`);
    }
  }

  /**
   * Update evaluation by ID
   */
  async updateEvaluation(
    locationId: number,
    locationSlug: string,
    studentId: number,
    evaluationId: number,
    updateDto: UpdateStudentEvaluationDto,
    loggedUserId?: number,
  ): Promise<StudentEvaluationDto> {
    try {
      // Verify student exists in this location
      const student = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);
      if (!student) {
        throw new NotFoundException(`student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Verify evaluation exists and belongs to this student
      const evaluation = await this.evaluationStudentRepository.findEvaluationById(evaluationId);
      if (!evaluation) {
        throw new NotFoundException(`Evaluation with ID ${evaluationId} not found`);
      }

      if (evaluation.studentId !== studentId) {
        throw new BadRequestException(`Evaluation does not belong to student ${studentId}`);
      }

      // Update evaluation
      const updatedEvaluation = await this.evaluationStudentRepository.updateEvaluation(evaluationId, updateDto);

      if (!updatedEvaluation) {
        throw new BadRequestException('Failed to update evaluation');
      }

      // Transform and return
      return this.studentEvaluationTransformationService.transformEvaluationToDto(updatedEvaluation);
    } catch (error) {
      console.error('Error in updateEvaluation service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update student evaluation: ${error.message}`);
    }
  }
}
