import { Expose } from 'class-transformer';

export class GroupLessonDiscountBodyDto {
  @Expose()
  lessonId: number;

  @Expose()
  enrolmentId: number;

  @Expose()
  value: number;

  @Expose()
  valueType: number;
}

export class GroupLessonDiscountResponseDto {
  @Expose()
  body: GroupLessonDiscountBodyDto;
}

