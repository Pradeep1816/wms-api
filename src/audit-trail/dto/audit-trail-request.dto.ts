import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AuditTrailListQueryDto {
  // Search text used across model, record, actor, and stored payload fields.
  @IsOptional()
  @IsString()
  q?: string;

  // Filter by the legacy model type string, for example `common\\models\\Payment`.
  @IsOptional()
  @IsString()
  modelType?: string;

  // Limit the result set to create, update, delete, or all entries.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(['all', 'create', 'update', 'delete'])
  action?: 'all' | 'create' | 'update' | 'delete';

  // Filter the history by the actor who wrote the audit entry.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  // Inclusive range start in the date format emitted by the frontend date picker.
  @IsOptional()
  @IsString()
  fromDate?: string;

  // Inclusive range end in the date format emitted by the frontend date picker.
  @IsOptional()
  @IsString()
  toDate?: string;

  // Standard page number used by the report table.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // Number of rows requested by the report table.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

