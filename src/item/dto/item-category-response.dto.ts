import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ItemCategoryResponseDto {
	@IsNumber()
	id: number;

	@IsString()
	name: string;

	@IsOptional()
	@IsString()
	description?: string | null;

	@IsNumber()
	royality: number;
}
