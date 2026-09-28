import { IsArray, IsNumberString, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemCategoryReportRowDto {
	@IsString()
	invoiceId: string; // e.g., 'I-59365'

	@IsNumberString()
	invoiceNumber: string; // numeric id as string

	@IsString()
	invoiceDate: string;

	@IsNumberString()
	customerId: string;

	@IsString()
	customerName: string;

	@IsString()
	itemCategoryId: string;

	@IsString()
	categoryName: string;

	@IsString()
	description: string;

	@IsString()
	subtotal: string;

	@IsString()
	tax: string;

	@IsString()
	total: string;
}

export class ItemCategoryReportResponseDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ItemCategoryReportRowDto)
	body: ItemCategoryReportRowDto[];

	footer: { subtotal: string; tax: string; total: string };
	meta: { startDate: string; endDate: string; location: string; categoryId?: string; categoryName?: string };
	mainFooter: { subtotal: string; tax: string; total: string };
	pagination: { page: number; limit: number; total: number; totalPages: number };
}


