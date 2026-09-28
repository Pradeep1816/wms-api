import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class TaxCollectedRequestDto {
	@IsOptional() @IsString()
	startDate?: string;

	@IsOptional() @IsString()
	endDate?: string;

	@IsOptional() @Transform(({ value }) => value === 'true' || value === true)
	@IsBoolean()
	summarize?: boolean;
}



