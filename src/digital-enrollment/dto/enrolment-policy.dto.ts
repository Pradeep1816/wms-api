import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const ENROLMENT_POLICY_MAX_TITLE = 255;
export const ENROLMENT_POLICY_MAX_CONTENT = 100000;

export class CreateEnrolmentPolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ENROLMENT_POLICY_MAX_TITLE)
  @Transform(trim)
  title: string;

  @IsString()
  @MaxLength(ENROLMENT_POLICY_MAX_CONTENT)
  @Transform(trim)
  content: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEnrolmentPolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENROLMENT_POLICY_MAX_TITLE)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ENROLMENT_POLICY_MAX_CONTENT)
  @Transform(trim)
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderEnrolmentPolicyItemDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderEnrolmentPoliciesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderEnrolmentPolicyItemDto)
  policies: ReorderEnrolmentPolicyItemDto[];
}
