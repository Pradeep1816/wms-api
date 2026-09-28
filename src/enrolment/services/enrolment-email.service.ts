import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EnrolmentEmailRepository } from '../repositories/enrolment-email.repository';
import { EnrolmentEmailDataDto } from '../dto/enrolment-email-response.dto';
import { EnrolmentEmailTransformationService } from './transformations/enrolment-email-transformation.service';

@Injectable()
export class EnrolmentEmailService {
  constructor(
    private readonly enrolmentEmailRepository: EnrolmentEmailRepository,
    private readonly enrolmentEmailTransformationService: EnrolmentEmailTransformationService,
  ) {}

  /**
   * Get enrolment email data for statement email modal
   * @param enrolmentId - The enrollment ID
   * @returns Transformed email data for the frontend
   */
  async getEnrolmentEmailData(
    locationId: number,
    locationSlug: string,
    enrolmentId: number,
  ): Promise<EnrolmentEmailDataDto> {
    try {
      const rawData = await this.enrolmentEmailRepository.getEnrolmentEmailDetail(
        locationId,
        enrolmentId,
      );

      if (!rawData.enrolment) {
        throw new NotFoundException(`Enrolment not found in location ${locationSlug} with id ${enrolmentId}`);
      }


      return this.enrolmentEmailTransformationService.transformEmailData(rawData);
    } catch (error) {
      console.error('Error in getEnrolmentEmailData service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve enrolment email data: ${error.message}`);
    }
  }
}
