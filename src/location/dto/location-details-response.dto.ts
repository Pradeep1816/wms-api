import { Expose } from 'class-transformer';

export class LocationDetailsResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  legalCorporateName: string;

  @Expose()
  address: string;

  @Expose()
  phoneNumber: string;

  @Expose()
  city: string;

  @Expose()
  province: string;

  @Expose()
  country: string;

  @Expose()
  postalCode: string;

  @Expose()
  email: string;

  @Expose()
  hstRegistrationNo: string;
}

