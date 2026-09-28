import { Expose } from 'class-transformer';

export class UpdateBlogResponseDto {
  @Expose()
  id: number;

  @Expose()
  title: string;

  @Expose()
  content: string;

  @Expose()
  date: string;

  @Expose()
  updatedByUserId: number;
}
