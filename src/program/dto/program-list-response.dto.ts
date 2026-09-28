import { Expose } from 'class-transformer';

/**
 * DTO for individual program item in list
 */
export class ProgramListItemDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  rate: number | null;

  @Expose()
  status: number;

  @Expose()
  type: number;
}

/**
 * DTO for program list data with pagination
 */
export class ProgramListDataDto {
  @Expose()
  body: ProgramListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
