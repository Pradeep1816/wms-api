import { IsNotEmpty, IsString, IsArray, IsOptional, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request DTO for sending invoice email
 *
 * PHP equivalent: backend/models/EmailForm.php
 * Maps: to -> $to, subject -> $subject, content -> $content, invoiceId -> $invoiceId
 *
 * Fields from PHP EmailForm NOT included (resolved server-side):
 *   - objectId: We know it's invoice from the endpoint route
 *   - userId: Retrieved from invoice.user_id
 *   - lessonId, paymentId: Not applicable for invoice emails
 */
export class SendInvoiceEmailRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  to?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  invoiceId?: number;
}
