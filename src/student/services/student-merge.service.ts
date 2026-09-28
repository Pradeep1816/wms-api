import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { StudentMergeRepository } from '../repositories/student-merge.repository';
import { StudentStatus } from '../enums/student-status.enum';
import { Student } from '../entities/student.entity';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogStudentService } from '../../log/services/log-student.service';

@Injectable()
export class StudentMergeService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly studentMergeRepository: StudentMergeRepository,
    private readonly logStudentService: LogStudentService,
  ) {}

  /**
   * Merge two students - transfers all data from source to target and soft-deletes source
   */
  async mergeStudents(
    sourceStudentId: number,
    targetStudentId: number,
    locationId: number,
    locationSlug: string,
    userId: number,
  ): Promise<any> {
    try {
      // Validate that source and target are different
      if (sourceStudentId === targetStudentId) {
        throw new BadRequestException('Source and target student cannot be the same');
      }

      // Fetch both students (already filters deleted students)
      const [sourceStudent, targetStudent] = await Promise.all([
        this.studentRepository.findStudentByIdAndLocation(sourceStudentId, locationId),
        this.studentRepository.findStudentByIdAndLocation(targetStudentId, locationId),
      ]);

      // Validate students exist
      if (!sourceStudent) {
        throw new NotFoundException(`Source student with ID ${sourceStudentId} not found in this location`);
      }

      if (!targetStudent) {
        throw new NotFoundException(`Target student with ID ${targetStudentId} not found in this location`);
      }

      // Validate merge conditions
      this.validateMerge(sourceStudent, targetStudent);

      // Execute merge in repository
      const result = await this.studentMergeRepository.merge(
        sourceStudent,
        targetStudentId,
        userId,
      );

      // Get student names for logging
      const sourceStudentName = `${sourceStudent.firstName} ${sourceStudent.lastName}`.trim();
      const targetStudentName = `${targetStudent.firstName} ${targetStudent.lastName}`.trim();

      // Create log
      await this.logStudentService.createStudentLog({
        action: LogActivityType.TYPE_MERGE,
        studentId: targetStudentId,
        studentName: targetStudentName,
        loggedUserId: userId,
        locationId,
        locationSlug,
        data: {
          sourceStudentId,
          sourceStudentName,
          targetStudentId,
          targetStudentName,
        },
      });

      // Return response
      return result;
    } catch (error) {
      console.error('Error in mergeStudents service:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to merge students: ${error.message}`);
    }
  }

  /**
   * Validate all merge conditions
   */
  private validateMerge(sourceStudent: Student, targetStudent: Student): void {
    // Check if source student is active
    if (sourceStudent.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException('Source student must be active to be merged');
    }

    // Check same customer
    if (sourceStudent.customerId !== targetStudent.customerId) {
      throw new BadRequestException(
        'Cannot merge students from different customers. Both students must belong to the same customer.',
      );
    }
  }
}
