import { IsString, IsNotEmpty, IsObject } from 'class-validator';
import { UpdateUserProfileDto } from './update-user-profile.dto';
import { UpdateUserEmailDto } from './update-user-email.dto';
import { UpdateUserPhoneDto } from './update-user-phone.dto';
import { UpdateUserAddressDto } from './update-user-address.dto';

// Discriminated union types for type-safe data
type UserInfoDataMap = {
  profile: UpdateUserProfileDto;
  email: UpdateUserEmailDto;
  phone: UpdateUserPhoneDto;
  addresses: UpdateUserAddressDto;
};

export type UserInfoType = keyof UserInfoDataMap;

// Union type for all possible data shapes
export type UserInfoData = UserInfoDataMap[UserInfoType];

export class CreateUserInfoDto {
  @IsString()
  @IsNotEmpty()
  type: UserInfoType;

  @IsObject()
  data: UserInfoData;
}

