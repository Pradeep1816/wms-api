import { IsArray, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class DeletePrivateLessonDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose any lessons to delete' })
  @IsNumber({}, { each: true })
  @Type(() => Number)
  ids: number[];
}
