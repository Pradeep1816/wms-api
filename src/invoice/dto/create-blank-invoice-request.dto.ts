import { IsInt, IsOptional, IsIn, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request DTO for creating blank invoice
 * 
 * NOTE: "+" button sends empty body {} 
 * no separate UI button/option for params in PHP
 * Params can only be manually crafted via URL: ?Invoice[customer_id]=123&Invoice[type]=2
 */
export class CreateBlankInvoiceRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  @ValidateIf((o) => o.customer_id !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2], { message: 'Type must be 1 (Pro-Forma Invoice) or 2 (Invoice)' })
  type?: number;
}
