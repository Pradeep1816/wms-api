import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProgramTypeEnum } from 'src/program/enums/program-type';
import { GroupLessonInvoiceRepository } from '../repositories/group-lesson-invoice.repository';

@Injectable()
export class GroupLessonInvoiceService {
  constructor(
    private readonly groupLessonInvoiceRepository: GroupLessonInvoiceRepository,
  ) {}

  async createGroupLessonInvoice(
    locationId: number,
    locationSlug: string,
    lessonId: number,
    enrolmentId: number | undefined,
    userId: number,
  ): Promise<
    | { invoiceId: number; invoiceNumber: string; alreadyExists: boolean }
    | { createdCount: number; alreadyExistsCount: number; totalEnrolments: number }
  > {
    try {
      const lesson = await this.groupLessonInvoiceRepository.findLesson(
        locationId,
        lessonId,
      );

      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found in location ${locationSlug}`);
      }

      if (lesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
        throw new BadRequestException('Only applicable for group lessons');
      }

      if (enrolmentId) {
        return await this.groupLessonInvoiceRepository.createGroupLessonInvoice(
          lesson,
          lessonId,
          enrolmentId,
          userId,
        );
      }

      return await this.groupLessonInvoiceRepository.createGroupLessonInvoicesForAllEnrolments(
        lesson,
        lessonId,
        userId,
      );
    } catch (error) {
      console.error('Error in createGroupLessonInvoice service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to create group lesson invoice: ${error.message}`);
    }
  }
}
