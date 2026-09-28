import { Expose, Type } from 'class-transformer';

export class CommentDto {
  @Expose()
  id: number;

  @Expose()
  content: string;

  @Expose()
  createdUser: string;

  @Expose()
  avatar: string;

  @Expose()
  createdOn: string;
}

export class CommentsDataDto {
  @Expose()
  @Type(() => CommentDto)
  body: CommentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CommentsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Comments retrieved successfully';

  @Expose()
  data: CommentsDataDto;
}
