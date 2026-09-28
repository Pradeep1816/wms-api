import { IsBoolean, IsOptional } from 'class-validator';
import { Type, Expose } from 'class-transformer';

/**
 * Request DTO for Void Invoice API
 */
export class VoidInvoiceRequestDto {
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  canBeUnscheduled: boolean = false;
}

/**
 * Response DTO for Void Invoice API
 */
export class VoidInvoiceResponseDto {
  @Expose()
  status: boolean;
}
