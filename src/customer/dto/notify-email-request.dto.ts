import { IsArray, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class NotifyEmailRequestDto {
  @IsArray()
  @ArrayMinSize(0)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  emailNotifyType: number[];
}

