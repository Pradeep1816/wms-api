import { Expose, Type } from 'class-transformer';

/**
 * Base user data structure
 */
export class BaseUserDataDto {
  @Expose()
  userId!: number;

  @Expose()
  isActive!: boolean | 'unknown';

  @Expose()
  firstName!: string;

  @Expose()
  lastName!: string;

  @Expose()
  email?: string;
}

/**
 * Customer-specific user data
 */
export class CustomerUserDataDto extends BaseUserDataDto {
  @Expose()
  students!: string;

  @Expose()
  balance!: string;
}

/**
 * Teacher-specific user data
 */
export class TeacherUserDataDto extends BaseUserDataDto {
  @Expose()
  phoneNumber!: string;
}

/**
 * Student-specific user data
 */
export class StudentUserDataDto {
  @Expose()
  id!: number;
  
  @Expose()
  isActive!: boolean | 'unknown';

  @Expose()
  firstName!: string;

  @Expose()
  lastName!: string;

  @Expose()
  customerName!: string;

  @Expose()
  phoneNumber!: string;

  @Expose()
  email!: string;
}

/**
 * Admin/Staff/Owner user data (uses base data)
 */
export class AdminUserDataDto extends BaseUserDataDto {}

/**
 * Response metadata for pagination
 */


/**
 * User list data structure (matches pattern from other modules like CustomerListDataDto, OutstandingInvoicesDataDto)
 */
export class UserListDataDto {
  @Expose()
  @Type(() => BaseUserDataDto)
  body!: (BaseUserDataDto | CustomerUserDataDto | TeacherUserDataDto | StudentUserDataDto | AdminUserDataDto)[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class UserListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Users list retrieved successfully';

  @Expose()
  data: UserListDataDto;
}
