import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemReportRequestDto {
	@IsOptional() @IsString()
	startDate?: string;

	@IsOptional() @IsString()
	endDate?: string;

	@IsOptional() @Type(() => Number) @IsInt() @Min(1)
	page?: number = 1;

	@IsOptional() @Type(() => Number) @IsInt() @IsPositive()
	limit?: number = 20;
}


