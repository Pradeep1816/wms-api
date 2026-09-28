import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ImportItemRowDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  upcCode?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  description: string;

  @IsNotEmpty()
  price: string | number;

  @IsNotEmpty()
  @IsString()
  itemCategory: string;

  @IsNotEmpty()
  @IsString()
  taxStatus: string;

  @IsOptional()
  royaltyFree?: string | number | boolean;

  @IsOptional()
  status?: string | number | boolean;
}

export class ImportItemsRequestDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportItemRowDto)
  rows: ImportItemRowDto[];
}

export interface ImportItemRowResult {
  row: number;
  code?: string;
  upcCode?: string;
  action: 'created' | 'updated' | 'skipped';
  errors: string[];
}

export interface ImportItemsResponseDto {
  created: number;
  updated: number;
  skipped: number;
  totalRows: number;
  errors: ImportItemRowResult[];
  results: ImportItemRowResult[];
}
