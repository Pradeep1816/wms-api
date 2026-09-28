import { Expose, Type } from 'class-transformer';

export class TeacherUnavailabilitySlotDto {
  @Expose()
  id: number;

  @Expose()
  start: string;

  @Expose()
  end: string;

  @Expose()
  reason: string | null;
}

export class TeacherUnavailabilityDataDto {
  @Expose()
  @Type(() => TeacherUnavailabilitySlotDto)
  unavailableHours: TeacherUnavailabilitySlotDto[];
}

export class TeacherUnavailabilityResponseDto {
  @Expose()
  @Type(() => TeacherUnavailabilityDataDto)
  body: TeacherUnavailabilityDataDto;
}


