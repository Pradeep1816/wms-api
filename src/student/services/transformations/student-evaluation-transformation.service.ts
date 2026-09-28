import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { StudentEvaluationDto, StudentEvaluationsDataDto } from '../../dto/student-evaluation-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { ExamResult } from '../../../evaluation/entities/exam-result.entity';

@Injectable()
export class StudentEvaluationTransformationService {
  /**
   * Transform exam result entity to Student Evaluation DTO
   */
  transformEvaluationToDto(evaluation: ExamResult): StudentEvaluationDto {
    const teacher = evaluation.teacher;
    const program = evaluation.program;

    const teacherName = teacher?.profile
      ? `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim()
      : '';

    const dtoData = {
      id: evaluation.id,
      programId: evaluation.programId,
      date: formatDate(evaluation.date),
      mark: evaluation.mark,
      level: evaluation.level || '',
      program: program?.name || '',
      type: evaluation.type || '',
      teacher: teacherName,
    };

    return plainToInstance(StudentEvaluationDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple evaluation entities to array
   */
  transformEvaluationList(evaluations: ExamResult[]): StudentEvaluationDto[] {
    return evaluations.map((evaluation) => this.transformEvaluationToDto(evaluation));
  }

  /**
   * Transform evaluations data with pagination
   */
  transformEvaluationsData(
    evaluations: ExamResult[],
    total: number,
    page: number,
    limit: number,
  ): StudentEvaluationsDataDto {
    const formattedEvaluations = this.transformEvaluationList(evaluations);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedEvaluations,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(StudentEvaluationsDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
