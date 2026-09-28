import { Expose, Type } from 'class-transformer';

class ItemDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  upcCode: string | null;

  @Expose()
  description: string;

  @Expose()
  price: number;

  @Expose()
  status: string;

  @Expose()
  royaltyFree: string;

  @Expose()
  taxStatusId: number;

  @Expose()
  trackInventory: boolean;

  @Expose()
  stockQuantity: number | null;

  @Expose()
  lowStockQuantity: number | null;
}

export class ItemListResponseDto {
  @Expose()
  @Type(() => ItemDto)
  body: ItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
