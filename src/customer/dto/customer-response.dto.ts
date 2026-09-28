import { Expose, Type } from 'class-transformer';

export class CustomerAccountResponseDto {
  @Expose()
  id: number;

  @Expose()
  customerId: number;

  @Expose()
  balance: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export class StudentResponseDto {
  @Expose()
  id: number;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  birthDate: Date;

  @Expose()
  customerId: number;

  @Expose()
  status: number;

  @Expose()
  gender: string;

  @Expose()
  note: string;

  @Expose()
  createdOn: Date;

  @Expose()
  updatedOn: Date;
}

export class UserEmailResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  isPrimary: boolean;
}

export class UserPhoneResponseDto {
  @Expose()
  id: number;

  @Expose()
  number: string;

  @Expose()
  isPrimary: boolean;
}

export class UserContactResponseDto {
  @Expose()
  id: number;

  @Expose()
  @Type(() => UserPhoneResponseDto)
  phones: UserPhoneResponseDto[];

  @Expose()
  @Type(() => UserEmailResponseDto)
  emails: UserEmailResponseDto[];
}

export class LocationResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  slug: string;

  @Expose()
  address: string;

  @Expose()
  city: string;

  @Expose()
  state: string;

  @Expose()
  zipCode: string;

  @Expose()
  phone: string;

  @Expose()
  email: string;
}

export class UserLocationResponseDto {
  @Expose()
  id: number;

  @Expose()
  userId: number;

  @Expose()
  locationId: number;

  @Expose()
  @Type(() => LocationResponseDto)
  location: LocationResponseDto;
}

export class UserProfileResponseDto {
  @Expose()
  id: number;

  @Expose()
  userId: number;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  middleName: string;

  @Expose()
  dateOfBirth: Date;

  @Expose()
  gender: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export class CustomerResponseDto {
  @Expose()
  id: number;

  @Expose()
  username: string;

  @Expose()
  status: number;

  @Expose()
  isDeleted: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  @Type(() => UserProfileResponseDto)
  userProfile: UserProfileResponseDto;

  @Expose()
  @Type(() => UserLocationResponseDto)
  userLocation: UserLocationResponseDto;

  @Expose()
  @Type(() => UserContactResponseDto)
  contact: UserContactResponseDto;

  @Expose()
  @Type(() => CustomerAccountResponseDto)
  customerAccount: CustomerAccountResponseDto;

  @Expose()
  @Type(() => StudentResponseDto)
  students: StudentResponseDto[];
}

export class CustomerListItemDto {
  @Expose()
  id: number;

  @Expose()
  isActive: boolean;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  email: string;


  @Expose()
  allEmails: string;

  @Expose()
  students: string;

  @Expose()
  balance: string;
}

export class CustomerListFooterDto {
  @Expose()
  id: string;

  @Expose()
  isActive: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  email: string;

  @Expose()
  students: string;

  @Expose()
  balance: string;
}

export class CustomerListDataDto {
  @Expose()
  body: CustomerListItemDto[];

  @Expose()
  footer: CustomerListFooterDto;

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CustomerListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customers list retrieved successfully';

  @Expose()
  data: CustomerListDataDto;
}


