import { IsOptional, IsString } from 'class-validator';

export class RoyaltyRequestDto {
	@IsOptional() @IsString()
	startDate?: string;

	@IsOptional() @IsString()
	endDate?: string;
}


