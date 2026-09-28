import { Expose } from 'class-transformer';
import { Max, Min, IsNumber, isNotEmpty, IsNotEmpty } from 'class-validator';

export class StudentEvaluationDto {
  @IsNotEmpty()
  @Expose()
  id: number;

  @IsNotEmpty()
  @Expose()
  programId: number;

  @IsNotEmpty()
  @Expose()
  date: string;

  @IsNotEmpty()
  @Expose()
  @Min(0)
  @Max(100)
  @IsNumber()
  mark: number;

  @IsNotEmpty()
  @Expose()
  level: string;

  @IsNotEmpty()
  @Expose()
  program: string;

  @IsNotEmpty()
  @Expose()
  type: string;

  @IsNotEmpty()
  @Expose()
  teacher: string;
}

export class StudentEvaluationsDataDto {
  @Expose()
  body: StudentEvaluationDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class StudentEvaluationsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Student evaluations retrieved successfully';

  @Expose()
  data: StudentEvaluationsDataDto;
}
