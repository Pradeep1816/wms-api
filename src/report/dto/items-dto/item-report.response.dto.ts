import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemReportRowDto {
	@IsString()
	dateLabel: string;

	@IsString()
	itemCode: string;

	@IsString()
	amount: string;
}

export class ItemReportResponseDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ItemReportRowDto)
	body: ItemReportRowDto[];

	footer: { amount: string };
	grandTotals: { amount: string };
	meta: { startDate: string; endDate: string; location: string };
	pagination: { page: number; limit: number; total: number; totalPages: number };
}


