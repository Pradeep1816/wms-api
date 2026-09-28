import { Expose, Type } from 'class-transformer';

export class EmailResponseDto {
  @Expose()
  id: number;

  @Expose()
  type: string;   

  @Expose()
  subject: string;

  @Expose()
  header: string;

  @Expose()
  footer: string;
}

export class EmailListResponseDto {
  @Expose()
  @Type(() => EmailResponseDto)
  body: EmailResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class EmailApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Email templates fetched successfully';

  @Expose()
  @Type(() => EmailListResponseDto)
  data: EmailListResponseDto;
}
