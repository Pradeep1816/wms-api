import { Expose } from 'class-transformer';

export class PrepaidLessonDto {
  @Expose()
  lessonId: string | null;

  @Expose()
  lessonDate: string;

  @Expose()
  status: string;

  @Expose()
  paid: string;
}

export class PrepaidLessonsDataDto {
  @Expose()
  body: PrepaidLessonDto[];

  @Expose()
  footer: { totalAmount: string };

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PrepaidLessonsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Prepaid lessons retrieved successfully';

  @Expose()
  data: PrepaidLessonsDataDto;
}

