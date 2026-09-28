import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { UserInvoicedLessonsResponseDto } from '../dto/user-invoiced-lessons-response.dto';
import { UserInvoicedLessonsRepository } from '../repositories/user-invoiced-lessons.repository';
import { UserInvoicedLessonsTransformationService } from '../services/transformations/user-invoiced-lessons-transformation.service';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UserInvoicedLessonsService {
  constructor(
    private readonly repository: UserInvoicedLessonsRepository,
    private readonly transformationService: UserInvoicedLessonsTransformationService,
  ) {}

  async getUserInvoicedLessons(
    locationId: number,
    userId: number,
    fromDate: string,
    toDate: string,
    summaryOnly?: boolean,
  ): Promise<UserInvoicedLessonsResponseDto> {
    try {
      // Legacy behavior: user portal always runs teacher-based invoiced lessons query.
      const invoiceLineItems = await this.repository.findInvoicedLessonsByTeacher(
        userId,
        locationId,
        fromDate,
        toDate,
      );

      const transformedInvoicedLessons = plainToInstance(
        UserInvoicedLessonsResponseDto,
        this.transformationService.transformToResponse(
          invoiceLineItems,
          summaryOnly,
        ),
      );
      return transformedInvoicedLessons;
    } catch (error) {
      console.error('Error in UserInvoicedLessonsService:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve user invoiced lessons',
      );
    }
  }
}
