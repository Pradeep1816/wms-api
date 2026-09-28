import { Expose } from 'class-transformer';

export class CreateLocationResponseDto {
  @Expose()
  id: number;

  @Expose()
  slug: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  url: string;
}
