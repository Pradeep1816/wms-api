import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';

export class TeacherCompensationAdjustmentQueryDto {
  @IsNotEmpty()
  @IsEnum(TeacherDocumentSignatureRequestType)
  documentType: TeacherDocumentSignatureRequestType;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}

export class UpsertTeacherCompensationAdjustmentDto extends TeacherCompensationAdjustmentQueryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minimumHours: number;

  @Transform(({ value }: { value: unknown }) => {
    if (value === '' || value == null) return undefined;
    return typeof value === 'number' || typeof value === 'string'
      ? value
      : undefined;
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
