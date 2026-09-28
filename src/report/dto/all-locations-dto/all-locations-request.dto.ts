import { IsOptional, IsString } from 'class-validator';

export class AllLocationsReportRequestDto {
	@IsOptional()
	@IsString()
	startDate?: string;

	@IsOptional()
	@IsString()
	endDate?: string;
}


