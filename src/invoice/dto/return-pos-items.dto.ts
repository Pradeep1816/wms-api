import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReturnPosLineDto {
  @IsInt() @Min(1) lineItemId: number;
  @IsInt() @Min(1) quantity: number;
}

export class ReturnPosItemsDto {
  @IsUUID() requestId: string;
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnPosLineDto)
  lines: ReturnPosLineDto[];
}
