import { Type } from "class-transformer";
import { IsOptional, Min, Max, IsNumber, IsIn, IsArray, ArrayMinSize, IsNotEmpty } from "class-validator";

export class EditInvoiceLineItemDiscountDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  lineItemIds: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  lineItemDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  lineItemDiscountValueType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  customerDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  paymentFrequencyDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  multiEnrolmentDiscount?: number;
}
