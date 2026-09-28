import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class TaxCollectedGroupRowDto {
	@IsString() @Expose() sourceId: string;
	@IsString() @Expose() customer: string;
	@IsString() @Expose() subtotal: string;
	@IsString() @Expose() tax: string;
	@IsString() @Expose() total: string;
}

export class TaxCollectedGroupDto {
	@IsString() @Expose() dateLabel: string;
	@ValidateNested({ each: true })
	@Type(() => TaxCollectedGroupRowDto)
	@IsArray()
	items: TaxCollectedGroupRowDto[];

	@Type(() => Object)
	footer: { subtotal: string; tax: string; total: string };
}

export class TaxCollectedResponseDto {
	@ValidateNested({ each: true })
	@Type(() => TaxCollectedGroupDto)
	@IsArray()
	body: TaxCollectedGroupDto[];

	@Type(() => Object)
	footer: { subtotal: string; tax: string; total: string };

	@Type(() => Object)
	meta: { startDate: string; endDate: string; location: string };
}


