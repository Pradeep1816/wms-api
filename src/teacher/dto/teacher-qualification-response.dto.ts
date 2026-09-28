import { Expose, Type } from 'class-transformer';

export class TeacherQualificationDto {
  @Expose()
  id: number;

  @Expose()
  programId: number;

  @Expose()
  programName: string;

  @Expose()
  rate: string;

  @Expose()
  type: number;
}

export class TeacherQualificationResponseDto {
  @Expose()
  @Type(() => TeacherQualificationDto)
  body: TeacherQualificationDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

