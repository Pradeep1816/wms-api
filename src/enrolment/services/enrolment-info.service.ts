import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EnrolmentInfoDataDto } from '../dto/enrolment-info-response.dto';
import { EnrolmentInfoRepository } from '../repositories/enrolment-info.repository';
import { EnrolmentInfoTransformationService } from './transformations/enrolment-info-transformation.service';

@Injectable()
export class EnrolmentInfoService {
  constructor(
    private readonly enrolmentInfoRepository: EnrolmentInfoRepository,
    private readonly enrolmentInfoTransformationService: EnrolmentInfoTransformationService,
  ) {}

  /**
   * Get enrolment info by ID
   */
  async getEnrolmentInfo(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentInfoDataDto> {
    try {
      const enrolment = await this.enrolmentInfoRepository.getEnrolmentById(
        enrolmentId,
        locationId,
      );

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Transform enrolment to DTO (program rates are included in enrolment data)
      return this.enrolmentInfoTransformationService.transformEnrolmentInfoData(enrolment);
    } catch (error) {
      console.error('Error in getEnrolmentInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve enrolment info: ${error.message}`);
    }
  }
}

