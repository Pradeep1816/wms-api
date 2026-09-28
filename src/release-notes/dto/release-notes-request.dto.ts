import { IsOptional, IsInt, Min, IsEnum, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetReleaseNotesRequestDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['subject', 'scheduleDate', 'createdDate', 'id'])
  sortBy?: 'subject' | 'scheduleDate' | 'createdDate' | 'id';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
