import { Expose, Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

export class RoyaltyFreeItemRowDto {
  @IsString() @Expose() lineItemId: string;
  @IsString() @Expose() id: string;
  @IsString() @Expose() date: string;
  @IsString() @Expose() code: string;
  @IsString() @Expose() description: string;
  @IsString() @Expose() subtotal: string;
  @IsString() @Expose() tax: string;
  @IsString() @Expose() total: string;
}

export class RoyaltyFreeItemsViewDto {
  @Expose()
  @Type(() => RoyaltyFreeItemRowDto)
  @ValidateNested({ each: true })
  @IsArray()
  body: RoyaltyFreeItemRowDto[];

  @Expose()
  footer: { total: string };
  @Expose() pagination: { page: number; limit: number; total: number; totalPages: number };
}