import { IsArray, IsIn, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class EditOnlineTypeDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson must be selected' })
  @IsNumber({}, { each: true })
  @Type(() => Number)
  lessonIds: number[];

  @IsIn([0, 1], { message: 'online must be 0 (In Class) or 1 (Online)' })
  @Type(() => Number)
  online: 0 | 1;
}
