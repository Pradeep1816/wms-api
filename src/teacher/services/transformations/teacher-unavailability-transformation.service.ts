import { Injectable } from '@nestjs/common';
import { TeacherUnavailability } from '../../entities/teacher-unavailability.entity';
import {
  TeacherUnavailabilityResponseDto,
  TeacherUnavailabilitySlotDto,
  TeacherUnavailabilityDataDto,
} from '../../dto/teacher-unavailability-response.dto';
import { formatDate, formatDateWithTime } from 'src/utils/date-utils';

@Injectable()
export class TeacherUnavailabilityTransformationService {
  transformToResponse(
    unavailability: TeacherUnavailability[],
  ): TeacherUnavailabilityResponseDto {
    const slots: TeacherUnavailabilitySlotDto[] = unavailability.map((record) => ({
      id: record.id,
      start: formatDateWithTime(record.fromDateTime),
      end: formatDateWithTime(record.toDateTime),
      reason: record.reason,
    }));

    const data: TeacherUnavailabilityDataDto = {
      unavailableHours: slots,
    };

    return {
      body: data,
    };
  }

}


