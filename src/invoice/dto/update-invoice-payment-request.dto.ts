import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Sub-payment distribution item for lessons
 * Matches PHP: PaymentEditForm::lessonPayments[] = [{id, value}, ...]
 */
export class LessonPaymentDistributionDto {
    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    id: number;

    @IsNumber()
    @Type(() => Number)
    value: number;
}

/**
 * Sub-payment distribution item for group lessons
 * Matches PHP: PaymentEditForm::groupLessonPayments[] = [{id, value}, ...]
 */
export class GroupLessonPaymentDistributionDto {
    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    id: number;

    @IsNumber()
    @Type(() => Number)
    value: number;
}

/**
 * Sub-payment distribution item for invoices
 * Matches PHP: PaymentEditForm::invoicePayments[] = [{id, value}, ...]
 */
export class InvoicePaymentDistributionDto {
    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    id: number;

    @IsNumber()
    @Type(() => Number)
    value: number;
}

/**
 * Request DTO for Update Invoice Payment API
 * Matches PHP: Payment model fields + PaymentEditForm fields
 *
 * Payment fields: date, payment_method_id, reference
 * PaymentEditForm fields: amount, lessonPayments, groupLessonPayments, invoicePayments
 */
export class UpdateInvoicePaymentRequestDto {
    /** PaymentEditForm[amount] - Amount Received */
    @IsNotEmpty({ message: 'Amount is required' })
    @IsNumber()
    @Type(() => Number)
    amount: number;

    /** PaymentEditForm[amountToDistribute] - total allocated amount */
    @IsNotEmpty({ message: 'Amount to distribute is required' })
    @IsNumber()
    @Type(() => Number)
    amountToDistribute: number;

    /** Payment[date] */
    @IsNotEmpty({ message: 'Date is required' })
    @IsString()
    date: string;

    /** Payment[payment_method_id] */
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    paymentMethodId?: number;

    /** Payment[reference] */
    @IsOptional()
    @IsString()
    reference?: string;

    /** PaymentEditForm[lessonPayments] - array built by JS from lesson line items */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LessonPaymentDistributionDto)
    lessonPayments?: LessonPaymentDistributionDto[];

    /** PaymentEditForm[groupLessonPayments] - array built by JS from group lesson line items */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GroupLessonPaymentDistributionDto)
    groupLessonPayments?: GroupLessonPaymentDistributionDto[];

    /** PaymentEditForm[invoicePayments] - array built by JS from invoice line items */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoicePaymentDistributionDto)
    invoicePayments?: InvoicePaymentDistributionDto[];
}

/**
 * Response DTO for Update Invoice Payment API
 * Matches legacy: { status: true } - no data payload
 */
export class UpdateInvoicePaymentResponseDto {
    @Expose()
    status: boolean;
}
