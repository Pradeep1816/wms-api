import { Transform, Type } from 'class-transformer';
import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';

/**
 * Query DTO for GET edit-discount.
 * Accepts ?lessonIds=1&lessonIds=2 or ?lessonIds=1,2,3
 */
export class GetEditDiscountQueryDto {
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map((v) => Number(v));
    if (typeof value === 'string') return value.split(',').map((v) => Number(v.trim()));
    return value;
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  lessonIds: number[];
}
