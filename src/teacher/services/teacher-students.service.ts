import {Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { TeacherStudentsResponseDto } from '../dto/teacher-students-response.dto';
import { TeacherStudentsRepository } from '../repositories/teacher-students.repository';
import { TeacherStudentsTransformationService } from './transformations/teacher-students-transformation.service';
import { plainToInstance } from 'class-transformer';
import { TeacherStudentsRequestDto } from '../dto/teacher-students-request.dto';
import { CustomerValidationService } from 'src/shared/services/customer-validation.service';

@Injectable()
export class TeacherStudentsService {
  constructor(
    private readonly repository: TeacherStudentsRepository,
    private readonly transformationService: TeacherStudentsTransformationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  async getTeacherStudents(
    locationSlug: string, // This is only for showing in the error message
    locationId: number,
    teacherId: number,
    query: TeacherStudentsRequestDto,
  ): Promise<TeacherStudentsResponseDto> {
    try {
      const { page = 1, limit = 20 } = query;

      const isExists = await this.validationService.validateCustomerExists(teacherId, locationId);
      if (!isExists) {
        throw new NotFoundException(`Teacher with id: ${teacherId} not found in location ${locationSlug}`);
      }

      const { students, total } = await this.repository.findStudentsByTeacher(
        teacherId,
        locationId,
        page,
        limit,
      );

      const transformedStudents = this.transformationService.transformToResponse(students);
      const totalPages = Math.ceil(total / limit);

      return plainToInstance(
        TeacherStudentsResponseDto,
        {
          body: transformedStudents,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        }
      );
    } catch (error) {
      console.error('Error in TeacherStudentsService:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher students');
    }
  }
}


