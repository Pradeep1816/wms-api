import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LessonEmailStatementRepository } from '../repositories/lesson-email-statement.repository';
import { LessonEmailStatementTransformationService } from './transformation/lesson-email-statement-transformation.service';
import { LessonEmailStatementDataDto } from '../dto/lesson-email-statement-response.dto';

@Injectable()
export class LessonEmailStatementService {
  constructor(
    private readonly lessonEmailStatementRepository: LessonEmailStatementRepository,
    private readonly lessonEmailStatementTransformationService: LessonEmailStatementTransformationService,
  ) {}

  /**
   * Get lesson email statement data
   */
  async getLessonEmailStatement(
    locationId: number,
    lessonId: number,
  ): Promise<LessonEmailStatementDataDto> {
    try {
      // 1. Fetch lesson with all required relations
      const lesson = await this.lessonEmailStatementRepository.getLessonWithRelations(
        lessonId,
        locationId,
      );

      if (!lesson) {
        throw new NotFoundException('Lesson not found');
      }

      // 2. Get customer ID from enrolment
      const enrolment = lesson.course?.enrolments?.[0];
      const student = enrolment?.student;
      const customerId = student?.user?.id;

      // 3. Fetch customer emails
      let emails: string[] = [];
      if (customerId) {
        emails = await this.lessonEmailStatementRepository.getCustomerEmails(customerId);
      }

      // 4. Fetch email template (emailTypeId = 2 for LESSON)
      const emailTemplate = await this.lessonEmailStatementRepository.getEmailTemplate(2);

      // 5. Fetch original lesson via lesson_hierarchy (for reschedule statement)
      // PHP: $model->getReschedule() -> lesson_hierarchy where childLessonId = lesson.id
      const originalLesson = await this.lessonEmailStatementRepository.getOriginalLessonFromHierarchy(lessonId);

      // 6. Transform data to response format
      const result = this.lessonEmailStatementTransformationService.transformEmailStatementData(
        lesson,
        emails,
        emailTemplate,
        originalLesson,
      );

      return result;
    } catch (error) {
      console.error('Error in getLessonEmailStatement service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve lesson email statement: ${error.message}`);
    }
  }
}
