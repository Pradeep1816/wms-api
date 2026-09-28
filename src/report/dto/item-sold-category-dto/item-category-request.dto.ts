import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ItemCategoryReportRequestDto {
	@IsOptional()
	@IsString()
	startDate?: string;

	@IsOptional()
	@IsString()
	endDate?: string;

	@IsOptional()
	@IsString()
	categoryId?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@IsPositive()
	limit?: number = 20;

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	groupByMethod?: boolean;

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	summaryOnly?: boolean = false;
}


