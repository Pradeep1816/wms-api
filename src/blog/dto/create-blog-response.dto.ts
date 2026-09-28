import { Expose } from 'class-transformer';

export class CreateBlogResponseDto {
  @Expose()
  id: number;

  @Expose()
  title: string;

  @Expose()
  content: string;

  @Expose()
  createdOn: string;

  @Expose()
  createdByUserId: number;
}
