import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class EmailTemplateObjectRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  objectId: number;
}
