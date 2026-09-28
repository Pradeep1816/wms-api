import { Expose, Type } from 'class-transformer';

// Nested DTOs for details section
export class LocationDetailsSectionDto {
  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  royalty: number;

  @Expose()
  advertisement: number;

  @Expose()
  conversionDate: string | null;
}

// Nested DTOs for address section
export class LocationAddressSectionDto {
  @Expose()
  address: string;

  @Expose()
  city: string;

  @Expose()
  province: string;

  @Expose()
  country: string;

  @Expose()
  postalCode: string;
}

// Main body DTO
export class LocationDetailsBodyDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  legalCorporateName: string;

  @Expose()
  slug: string;

  @Expose()
  @Type(() => LocationDetailsSectionDto)
  details: LocationDetailsSectionDto;

  @Expose()
  @Type(() => LocationAddressSectionDto)
  address: LocationAddressSectionDto;

  @Expose()
  hstRegistrationNo: string;
}

// Data wrapper DTO
export class LocationDetailsDataDto {
  @Expose()
  @Type(() => LocationDetailsBodyDto)
  body: LocationDetailsBodyDto;
}

// Response DTO
export class LocationInfoResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Location details retrieved successfully';

  @Expose()
  @Type(() => LocationDetailsDataDto)
  data: LocationDetailsDataDto;
}
