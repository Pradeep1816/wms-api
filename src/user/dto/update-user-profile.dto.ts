import {
  IsString,
  IsOptional,
  IsNumber,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Lazy-load dayjs to avoid module loading issues
let dayjsInstance: any = null;
let dayjsInitialized = false;

function getDayjs() {
  if (!dayjsInitialized) {
    dayjsInstance = require('dayjs');
    const customParseFormat = require('dayjs/plugin/customParseFormat');
    dayjsInstance.extend(customParseFormat);
    dayjsInitialized = true;
  }
  return dayjsInstance;
}

// Transform date from "MMM DD, YYYY" or "MMM D, YYYY" format to ISO 8601 (YYYY-MM-DD)
function transformProfileDate(value: any): string | undefined {
  // Return undefined for null, undefined, or empty values
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  // Convert to string if it's not already
  const dateStr = typeof value === 'string' ? value : String(value);

  // If already in ISO format (YYYY-MM-DD), return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse formats like "Jun 07, 1998" or "Jun 7, 1998"
  try {
    const dayjs = getDayjs();

    // Try parsing with double-digit day format first: "Jun 07, 1998"
    let parsed = dayjs(dateStr, 'MMM DD, YYYY', true);
    if (!parsed.isValid()) {
      // Try single-digit day format: "Jun 7, 1998"
      parsed = dayjs(dateStr, 'MMM D, YYYY', true);
    }

    if (parsed.isValid()) {
      // Convert to ISO format (YYYY-MM-DD)
      return parsed.format('YYYY-MM-DD');
    }

    // Fallback: try dayjs default parsing
    const fallback = dayjs(dateStr);
    if (fallback.isValid()) {
      return fallback.format('YYYY-MM-DD');
    }
  } catch (error) {
    // If parsing fails, return undefined (will be caught by validation)
    console.warn('Failed to parse profile date:', dateStr, error);
    return undefined;
  }

  return undefined;
}

export class UpdateUserProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  firstname?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  lastname?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  businessName?: string;

  @Transform(({ value }) => transformProfileDate(value))
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @Transform(({ value }) => transformProfileDate(value))
  @IsDateString()
  @IsOptional()
  dateStarted?: string;

  @IsNumber()
  @IsOptional()
  referralSourceId?: number;

  @IsString()
  @IsOptional()
  referralSourceDescription?: string;
}
