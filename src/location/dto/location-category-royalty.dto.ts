import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  ValidateIf,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LocationCategoryRoyaltyRateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  royality: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  advertisement?: number;
}

export class UpdateLocationCategoryRoyaltiesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LocationCategoryRoyaltyRateDto)
  rates: LocationCategoryRoyaltyRateDto[];
}

export interface LocationCategoryRoyaltyResponseDto {
  categoryId: number;
  categoryName: string;
  royality: number;
  advertisement: number;
  isLesson: boolean;
}
