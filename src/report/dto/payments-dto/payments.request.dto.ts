import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PaymentsRequestDto {
	@IsOptional()
	@IsDateString()
	startDate?: string;

	@IsOptional()
	@IsDateString()
	endDate?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 20;

	@IsOptional()
	@Transform(({ value }) => {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
		return false;
	})
	@IsBoolean()
	summaryOnly?: boolean = false;
}



