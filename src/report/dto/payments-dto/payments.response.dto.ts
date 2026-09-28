import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentsReportRowDto {
	@IsString() paymentId: string;
	@IsString() paymentDate: string;
	@IsString() amount: string;

	@Type(() => Number) @IsInt()
	paymentMethodId: number;

	@IsString() paymentMethodName: string;
	@IsString() customer: string;
	@IsString() userId: string;

	@IsOptional() @IsString()
	reference?: string;

	@IsOptional() @IsString()
	students?: string;
}

export class PaymentsReportResponseDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => PaymentsReportRowDto)
	body: PaymentsReportRowDto[];

	footer: { amount: string };
	@IsOptional()
	grandTotals?: { amount: string };
	pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Back-compat alias for existing imports
export type PaymentsResponseDto = PaymentsReportResponseDto;


