import { Expose } from 'class-transformer';

/**
 * Response DTO for create Item.
 */
export class CreateItemResponseDto {
  @Expose()
  id: number;

  @Expose()
  itemCategoryId: number;

  @Expose()
  locationId: number;

  @Expose()
  code: string;

  @Expose()
  upcCode: string | null;

  @Expose()
  description: string;

  @Expose()
  price: number;

  @Expose()
  royaltyFree: number;

  @Expose()
  taxStatusId: number;

  @Expose()
  status: number;
}

