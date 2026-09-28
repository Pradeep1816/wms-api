import { Expose, Type } from 'class-transformer';

export class TestEmailResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;
}
export class TestEmailListResponseDto {
  @Expose()
  @Type(() => TestEmailResponseDto)
  body: TestEmailResponseDto[];
  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
export class TestEmailApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Test Emails retrieved successfully';

  @Expose()
  @Type(() => TestEmailListResponseDto)
  data: TestEmailListResponseDto;
}
