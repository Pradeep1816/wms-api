import { Expose, Type } from 'class-transformer';

class BlogItemDto {
  @Expose()
  id: number;

  @Expose()
  userId: number; 
  
  @Expose()
  userName: string | null;

  @Expose()
  title: string;

  @Expose()
  content: string;

  @Expose()
  date: Date;   
}

class PaginationDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class BlogListResponseDto {
  @Expose()
  @Type(() => BlogItemDto)
  body: BlogItemDto[];

  @Expose()
  @Type(() => PaginationDto)
  pagination: PaginationDto;
}