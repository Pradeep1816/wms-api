import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupEnrolmentPrintRepository } from '../repositories/group-enrolment-print.repository';
import { GroupEnrolmentPrintTransformationService } from './transformations/group-enrolment-print-transformation.service';
import { GroupEnrolmentPrintDetailDto } from '../dto/group-enrolment-print-response.dto';

@Injectable()
export class GroupEnrolmentPrintService {
  constructor(
    private readonly groupEnrolmentPrintRepository: GroupEnrolmentPrintRepository,
    private readonly groupEnrolmentPrintTransformationService: GroupEnrolmentPrintTransformationService,
  ) {}

  async getGroupEnrolmentPrintDetail(
    locationId: number,
    enrolmentId: number,
  ): Promise<GroupEnrolmentPrintDetailDto> {
    try {
      const data = await this.groupEnrolmentPrintRepository.getGroupEnrolmentPrintDetail(
        locationId,
        enrolmentId,
      );

      if (!data.enrolment) {
        throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
      }

      return this.groupEnrolmentPrintTransformationService.transform(data)!;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in getGroupEnrolmentPrintDetail service:', error);
      throw error;
    }
  }
}
