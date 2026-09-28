import { Injectable } from '@nestjs/common';
import { Qualification } from '../../../qualification/entities/qualification.entity';
import { TeacherQualificationDto } from '../../dto/teacher-qualification-response.dto';
import { formatCurrency } from '../../../utils/formatters';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class TeacherQualificationTransformationService {
  /**
   * Transform a single Qualification entity to TeacherQualificationDto
   * @param qualification - Qualification entity with program relation
   * @returns TeacherQualificationDto
   */
  transformQualificationToDto(qualification: Qualification): TeacherQualificationDto {
    const programName = qualification.program?.name || '';
    const rate = qualification.rate ? Number(qualification.rate) : 0;
    const formattedRate = rate > 0 ? formatCurrency(rate) : '';
    
    const dtoData = {
      id: qualification.id,
      programId: qualification.programId,
      programName: programName,
      rate: formattedRate,
      type: qualification.type,
    };

    return plainToInstance(TeacherQualificationDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple Qualification entities to TeacherQualificationDto array
   * @param qualifications - Array of Qualification entities
   * @returns Array of TeacherQualificationDto
   */
  transformQualificationsToDtos(qualifications: Qualification[]): TeacherQualificationDto[] {
    return qualifications.map(qualification => this.transformQualificationToDto(qualification));
  }
}

