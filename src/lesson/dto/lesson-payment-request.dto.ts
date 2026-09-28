import { IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Query params for Lesson Payment GET API
 *
 * - sort: 'amount' - Field to sort by
 * - order: 'ASC' | 'DESC' - Sort order (case-insensitive in query, normalized here)
 *
 * Default: no sorting (returns in DB default order)
 * First click: ?sort=amount&order=ASC  → ascending
 * Second click: ?sort=amount&order=DESC → descending
 */
export class LessonPaymentRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enrolmentId?: number;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
