import { Expose } from 'class-transformer';

export class UpdateTestEmailResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  updatedOn: string;

  @Expose()
  updatedByUserId: number;
}
