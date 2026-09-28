import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';

export enum TeacherDocumentSignatureTrackingStatus {
  SIGNED = 'signed',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
  VOID = 'void',
  NOT_SENT = 'not_sent',
}

export enum TeacherDocumentSignatureTeacherStatusFilter {
  ALL = 'all',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class CreateTeacherDocumentSignatureRequestDto {
  @IsNotEmpty()
  @IsEnum(TeacherDocumentSignatureRequestType)
  documentType: TeacherDocumentSignatureRequestType;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  summaryOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  forceCreate?: boolean;
}

export class SignTeacherDocumentSignatureRequestDto {
  @IsNotEmpty()
  @IsString()
  signerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  signatureDataUrl?: string | null;
}

export class RejectTeacherDocumentSignatureRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  rejection_reason: string;
}

export class VoidTeacherDocumentSignatureRequestDto {
  /**
   * Required: a voided document stays on file permanently, so the record is
   * only useful in an audit if it says why it was voided.
   */
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class TeacherDocumentSignatureTrackingQueryDto {
  @IsNotEmpty()
  @IsEnum(TeacherDocumentSignatureRequestType)
  documentType: TeacherDocumentSignatureRequestType;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsEnum(TeacherDocumentSignatureTrackingStatus)
  status?: TeacherDocumentSignatureTrackingStatus;

  @IsOptional()
  @IsEnum(TeacherDocumentSignatureTeacherStatusFilter)
  teacherStatus?: TeacherDocumentSignatureTeacherStatusFilter =
    TeacherDocumentSignatureTeacherStatusFilter.ACTIVE;
}

export class TeacherInvoicedLessonsBatchPreviewQueryDto {
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  summaryOnly?: boolean;

  @IsOptional()
  @IsEnum(TeacherDocumentSignatureTeacherStatusFilter)
  teacherStatus?: TeacherDocumentSignatureTeacherStatusFilter =
    TeacherDocumentSignatureTeacherStatusFilter.ACTIVE;
}

export class TeacherDocumentPreviewQueryDto {
  @IsNotEmpty()
  @IsEnum(TeacherDocumentSignatureRequestType)
  documentType: TeacherDocumentSignatureRequestType;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  summaryOnly?: boolean;
}

export class TeacherDocumentSignatureRequestPreviewQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  summaryOnly?: boolean;
}

export class TeacherDocumentAnnualInvoiceHistoryQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Number(value);
  })
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsEnum(TeacherDocumentSignatureTeacherStatusFilter)
  teacherStatus?: TeacherDocumentSignatureTeacherStatusFilter =
    TeacherDocumentSignatureTeacherStatusFilter.ACTIVE;
}
