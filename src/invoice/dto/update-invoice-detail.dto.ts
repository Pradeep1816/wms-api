import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { Expose } from 'class-transformer';

/**
 * Request DTO for updating invoice details (date field only).
 */
export class UpdateInvoiceDetailRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be in YYYY-MM-DD format',
  })
  date: string;
}

/**
 * Response DTO for invoice detail update.
 */
export class UpdateInvoiceDetailInfo {
  @Expose()
  id: number;

  @Expose()
  date: string;
}

export class UpdateInvoiceDetailResponseDto {
  @Expose()
  body: UpdateInvoiceDetailInfo;
}
