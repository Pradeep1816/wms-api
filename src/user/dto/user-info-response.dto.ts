import { Expose, Type } from 'class-transformer';

/**
 * User profile information DTO
 */
export class UserInfoProfileDto {
  @Expose()
  name!: string;

  @Expose()
  role?: string;

  @Expose()
  status?: string;

  @Expose()
  canLogin?: boolean;

  @Expose()
  birthDate?: string | null;

  @Expose()
  businessName?: string | null;

  @Expose()
  dateStarted?: string | null;

  @Expose()
  dateStartedIsFallback?: boolean;

  @Expose()
  referralSource?: string | null;
}

/**
 * User email information DTO
 */
export class UserInfoEmailDto {
  @Expose()
  id!: number;

  @Expose()
  userContactId!: number;

  @Expose()
  email!: string;

  @Expose()
  note!: string;

  @Expose()
  label!: string;

  @Expose()
  isPrimary!: boolean;
}

/**
 * User phone information DTO
 */
export class UserInfoPhoneDto {
  @Expose()
  id!: number;

  @Expose()
  userContactId!: number;

  @Expose()
  number!: string;

  @Expose()
  extension!: string | null;

  @Expose()
  note!: string;

  @Expose()
  label!: string;

  @Expose()
  isPrimary!: boolean;
}

/**
 * User address information DTO
 */
export class UserInfoAddressDto {
  @Expose()
  id!: number;

  @Expose()
  address!: string;

  @Expose()
  cityId!: number;

  @Expose()
  city!: string;

  @Expose()
  provinceId!: number;

  @Expose()
  province!: string;

  @Expose()
  countryId!: number;

  @Expose()
  country!: string;

  @Expose()
  postalCode!: string;

  @Expose()
  label!: string;

  @Expose()
  isPrimary!: boolean;
}

export class UserContactLabelDto {
  @Expose()
  id!: number;

  @Expose()
  name!: string;
}

/**
 * Complete user info data structure
 */
export class UserInfoDataDto {
  @Expose()
  @Type(() => UserInfoProfileDto)
  profile!: UserInfoProfileDto | null;

  @Expose()
  @Type(() => UserInfoEmailDto)
  email!: UserInfoEmailDto[];

  @Expose()
  @Type(() => UserInfoPhoneDto)
  phone!: UserInfoPhoneDto[];

  @Expose()
  @Type(() => UserInfoAddressDto)
  addresses!: UserInfoAddressDto[];

  @Expose()
  @Type(() => UserContactLabelDto)
  contactLabels!: UserContactLabelDto[];
}

/**
 * User info response body wrapper (matches pattern from other modules)
 */
export class UserInfoResponseBodyDto {
  @Expose()
  @Type(() => UserInfoDataDto)
  body!: UserInfoDataDto;
}

/**
 * User info response DTO
 */
export class UserInfoResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'User info retrieved successfully';

  @Expose()
  @Type(() => UserInfoResponseBodyDto)
  data!: UserInfoResponseBodyDto;
}
