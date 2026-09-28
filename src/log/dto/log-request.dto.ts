import { IsOptional, IsNumber, Min, Max, IsNotEmpty, IsEnum, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { LogObjectType } from '../enums/log-object-type.enum';

export class LogHistoryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsNotEmpty()
  @IsEnum(LogObjectType, {
    message: `type must be one of: ${Object.values(LogObjectType).join(', ')}`
  })
  type: LogObjectType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id: number;

}

export class TimelineRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate must be in format "YYYY-MM-DD"',
  })
  fromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate must be in format "YYYY-MM-DD"',
  })
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  createdUserId?: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

