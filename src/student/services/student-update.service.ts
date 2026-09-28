import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { StudentUpdateRepository } from '../repositories/student-update.repository';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { LogStudentService } from '../../log/services/log-student.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';

@Injectable()
export class StudentUpdateService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly studentUpdateRepository: StudentUpdateRepository,
    private readonly logStudentService: LogStudentService,
  ) {}

  /**
   * Update student details by ID
   */
  async updateStudentById(
    studentId: number,
    locationId: number,
    locationSlug: string,
    updateDto: UpdateStudentDto,
    loggedUserId: number,
  ): Promise<any> {
    try {
      // Get old attributes before update
      const oldStudent = await this.studentRepository.findStudentByIdAndLocation(studentId, locationId);
      
      if (!oldStudent) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      // Get old attributes for comparison
      const oldAttributes = {
        firstName: oldStudent.firstName,
        lastName: oldStudent.lastName,
        birthDate: oldStudent.birthDate,
        gender: oldStudent.gender,
        note: oldStudent.note,
        mediaAndOnlineLessonConsent: oldStudent.mediaAndOnlineLessonConsent,
      };

      // Get update data from DTO
      const updateData = updateDto.toUpdateData();

      // Check if there are any fields to update
      if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('No valid fields provided for update');
      }

      // Update the student using transaction
      const updatedStudent = await this.studentUpdateRepository.updateStudent(
        studentId,
        locationId,
        updateData,
        loggedUserId,
      );

      // Create update log with old and new attributes
      if (loggedUserId) {
        const studentName = `${updatedStudent.firstName} ${updatedStudent.lastName}`;

        // Build log data with old and new values
        const logData = {
          oldAttributes,
          newAttributes: updateDto,
        };

        this.logStudentService.createStudentLog({
          action: LogActivityType.TYPE_UPDATE,
          studentId,
          studentName,
          loggedUserId,
          locationId,
          locationSlug,
          data: logData,
        }).then(() => {
          console.log(`Student details update log created successfully for student: ${studentName}`);
        }).catch(error => {
          console.error(`Failed to create student info update log for student: ${studentName}`, error.message);
        });
      }

      return updatedStudent;
    } catch (error) {
      console.error('Error in updateStudentById service:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      if (error.message === 'Student not found') {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }
      throw new BadRequestException(`Failed to update student: ${error.message}`);
    }
  }
}
