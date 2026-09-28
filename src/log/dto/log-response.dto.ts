import { Expose, Type } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  username: string;

  @Expose()
  profile: {
    firstname: string;
    lastname: string;
  };
}

export class LogHistoryItemDto {
  @Expose()
  id: number;

  @Expose()
  createdOn: string | null;

  @Expose()
  message: string;
}

export class LogHistoryDataDto {
  @Expose()
  @Type(() => LogHistoryItemDto)
  body: LogHistoryItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class LogHistoryResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Log history retrieved successfully';

  @Expose()
  data: LogHistoryDataDto;
}

export class TimelineItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  createdUser: string;

  @Expose()
  message: string;
}

export class TimelineDataDto {
  @Expose()
  @Type(() => TimelineItemDto)
  body: TimelineItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

