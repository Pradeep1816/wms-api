import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EmailSendObjectTypeEnum } from '../enums/send-email-object-type.enum';

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
  }

  return [];
}

export class SendEmailRequestDto {
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one recipient email is required' })
  @IsString({ each: true })
  to: string[];

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsString({ each: true })
  bcc?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([
    EmailSendObjectTypeEnum.COURSE,
    EmailSendObjectTypeEnum.LESSON,
    EmailSendObjectTypeEnum.PFI,
    EmailSendObjectTypeEnum.INVOICE,
    EmailSendObjectTypeEnum.RECEIPT,
    EmailSendObjectTypeEnum.PAYMENT,
    EmailSendObjectTypeEnum.MESSAGE,
    EmailSendObjectTypeEnum.CUSTOMER_STATEMENT,
    EmailSendObjectTypeEnum.OVERDUE_LESSON,
  ], {
    message: 'objectId must be one of 1, 2, 3, 4, 5, 6, 7, 8, 9',
  })
  objectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lessonId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  invoiceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paymentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paymentRequestId?: number;
}
