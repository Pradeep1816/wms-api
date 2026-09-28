import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ReceivePaymentDistributionItemDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  id: number;

  @Type(() => Number)
  @IsNumber()
  value: number;
}

export class ReceivePaymentCreditItemDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  id: number;

  @Type(() => Number)
  @IsNumber()
  value: number;
}

export class ReceivePaymentRoyaltyPurposeDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  itemCategoryId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;
}

export class ReceivePaymentRoyaltyRefundAllocationDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  originalPaymentId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  itemCategoryId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;
}

export class ReceivePaymentRequestDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  customerId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paymentMethodId?: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentDistributionItemDto)
  invoicePayments?: ReceivePaymentDistributionItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentDistributionItemDto)
  lessonPayments?: ReceivePaymentDistributionItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentDistributionItemDto)
  groupLessonPayments?: ReceivePaymentDistributionItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentCreditItemDto)
  paymentCredits?: ReceivePaymentCreditItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentCreditItemDto)
  invoiceCredits?: ReceivePaymentCreditItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentRoyaltyPurposeDto)
  unappliedRoyaltyPurposes?: ReceivePaymentRoyaltyPurposeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePaymentRoyaltyRefundAllocationDto)
  royaltyRefundAllocations?: ReceivePaymentRoyaltyRefundAllocationDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  canUsePaymentCredits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  canUseInvoiceCredits?: number;
}
