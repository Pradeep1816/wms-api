import { IsNotEmpty, IsArray, ArrayMinSize, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConfirmSubstituteRequestDto {
  @IsNotEmpty({ message: 'Lesson IDs are required' })
  @IsArray({ message: 'IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one lesson ID must be provided' })
  @IsNumber({}, { each: true, message: 'Each ID must be a number' })
  @Transform(({ value }) => {
    // Handle comma-separated string: "1,2,3" -> [1, 2, 3]
    if (typeof value === 'string') {
      return value.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
    }
    // Handle array: [1, 2, 3] or ["1", "2", "3"]
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? parseInt(v, 10) : v));
    }
    return value;
  })
  ids: number[];

  /** Draft lesson IDs in the same order as ids (ids[i] pairs with newLessonIds[i]). Required for correct pairing. */
  @IsNotEmpty({ message: 'New lesson IDs are required for confirm' })
  @IsArray({ message: 'New lesson IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one new lesson ID must be provided' })
  @IsNumber({}, { each: true, message: 'Each new lesson ID must be a number' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
    }
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? parseInt(v, 10) : v));
    }
    return value;
  })
  newLessonIds: number[];
}
