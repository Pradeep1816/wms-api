import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, Max, MinLength, ValidateIf, IsBoolean } from 'class-validator';

const transformBooleanLike = ({ value }: { value: any }) => {
  if (value === true || value === false) {
    return value;
  }
  if (value === 1 || value === '1') {
    return true;
  }
  if (value === 0 || value === '0') {
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
};

export class SetPasswordDto {
  @ValidateIf((o) => o.password !== undefined && o.password !== null && o.password !== '')
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @ValidateIf((o) => o.password !== undefined && o.password !== null && o.password !== '')
  @IsString({ message: 'Confirm password must be a string' })
  @MinLength(6, { message: 'Confirm password must be at least 6 characters' })
  confirmPassword?: string;

  @IsInt()
  @IsOptional()
  @Min(1111, { message: 'PIN must be at least 1111' })
  @Max(9999, { message: 'PIN must not exceed 9999' })
  pin?: number;

  @IsOptional()
  @Transform(transformBooleanLike)
  @IsBoolean({ message: 'merge must be a boolean' })
  merge?: boolean;

  @IsOptional()
  @Transform(transformBooleanLike)
  @IsBoolean({ message: 'canLogin must be a boolean' })
  canLogin?: boolean;
}
