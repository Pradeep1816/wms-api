import { IsArray, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class GeneratePrivateInvoiceDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson ID is required' })
  @IsNumber({}, { each: true })
  @Type(() => Number)
  lessonIds: number[];
}
