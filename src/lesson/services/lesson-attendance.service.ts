import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { LessonAttendanceRepository } from '../repositories/lesson-attendance.repository';
import { LessonConfirmationService } from './lesson-confirmation.service';
import { UpdateAttendanceResponseDto } from '../dto/update-attendance-response.dto';

@Injectable()
export class LessonAttendanceService {
  constructor(
    private readonly lessonAttendanceRepository: LessonAttendanceRepository,
    @Inject(forwardRef(() => LessonConfirmationService))
    private readonly lessonConfirmationService: LessonConfirmationService,
  ) {}

  /**
   * Update lesson attendance (isPresent field)
   * 
   * @param locationId - Location ID 
   * @param lessonId - Lesson ID to update
   * @param present - New attendance value (true = present, false = absent)
   * @param userId - Logged-in user ID for audit
   * @returns Updated attendance data
   */
  async updateAttendance(
    locationId: number,
    lessonId: number,
    present: boolean,
    userId: number,
  ): Promise<UpdateAttendanceResponseDto> {

    const lesson = await this.lessonAttendanceRepository.findLessonById(lessonId, locationId);

    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }

    if (!this.lessonAttendanceRepository.isPrivateLesson(lesson)) {
      throw new BadRequestException('Only private lessons have editable attendance');
    }
    
    if (!this.lessonAttendanceRepository.isNotUnscheduled(lesson)) {
      throw new BadRequestException('Cannot edit attendance for unscheduled lessons');
    }

    await this.lessonAttendanceRepository.updateAttendance(lessonId, present, userId);

    const customerId = await this.lessonAttendanceRepository.getCustomerIdByLesson(lessonId);
    if (customerId) {
      try {
        await this.lessonConfirmationService.updateCustomerBalance(customerId);
      } catch (error) {
      
        console.error('Error updating customer balance after attendance change:', error);
      }
    }

    // Return response
    return {
      id: lessonId,
      present,
    };
  }
}
