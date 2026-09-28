import { IsOptional, IsString, IsIn, IsNumber, Min, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { RolesEnum } from '../../auth/enums/roles.enum';

export class UserListRequestDto {

  // this may be removed in the future
  // admin/v2/training-location/user/list for this need to pass role as query parameter
  @IsOptional()
  @IsString()
  @IsIn([
    RolesEnum.TEACHER,
    RolesEnum.ADMINISTRATOR,
    RolesEnum.STAFFMEMBER,
    RolesEnum.OWNER,
    RolesEnum.CUSTOMER,
    RolesEnum.STUDENT,
  ])
  @Transform(({ value }) => {
    // Normalize 'admin' to 'administrator' for consistency
    if (value === 'admin') {
      return RolesEnum.ADMINISTRATOR;
    }
    return value;
  })
  role?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  studentsName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsIn(['all', 'owing', 'credit'])
  balance?: 'all' | 'owing' | 'credit';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  status?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showAll?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showActive?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showInActive?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['firstName', 'lastName', 'email', 'phone', 'customer'])
  @Transform(({ value, obj }) => {
    // Map sort fields for student role
    if (obj.role === RolesEnum.STUDENT) {
      const studentSortMapping: Record<string, string> = {
        firstName: 'firstName',
        lastName: 'lastName',
        customer: 'customer',
        phone: 'phone',
      };
      return studentSortMapping[value] || 'firstName';
    }
    return value;
  })
  sort?: 'firstName' | 'lastName' | 'email' | 'phone' | 'customer' = 'lastName';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  @Transform(({ value }) => value?.toUpperCase())
  order?: 'ASC' | 'DESC' = 'ASC';
}

