import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentDeleteRepository } from '../repositories/student-delete.repository';
import { StudentRepository } from '../repositories/student.repository';

@Injectable()
export class StudentDeleteService {
  constructor(
    private readonly studentDeleteRepository: StudentDeleteRepository,
    private readonly studentRepository: StudentRepository,
  ) {}

  /**
   * Delete student by ID (soft delete)
   * Validates that student has no active enrolments or lessons before deletion
   */
  async deleteStudentById(
    studentId: number,
    locationId: number,
    locationSlug: string,
    loggedUserId: number,
  ): Promise<any> {
    try {
      // Find student first
      const student = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);

      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Check if student has active enrolments
      const hasEnrolment = await this.studentDeleteRepository.hasActiveEnrolment(studentId);
      // Check if student has active lessons
      const hasLesson = await this.studentDeleteRepository.hasActiveLesson(studentId);
     
      if (hasEnrolment || hasLesson) {
        throw new BadRequestException("Unable to delete the student. Student has enrolment/lesson/invoice history associated with them.")
      }

      // Soft delete the student
      const result = await this.studentDeleteRepository.softDeleteStudent(
        studentId,
        locationId,
        loggedUserId,
      );
      return result;
    } catch (error) {
      console.error('Error in deleteStudentById service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete student: ${error.message}`);
    }
  }
}
