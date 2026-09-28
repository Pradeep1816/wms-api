import { Expose, Type } from 'class-transformer';

export class TimelineCreatedUserDto {
  @Expose()
  id: number;

  @Expose()
  publicIdentity: string;
}

export class TimelineCreatedUsersResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Timeline created users retrieved successfully';

  @Expose()
  @Type(() => TimelineCreatedUserDto)
  body: TimelineCreatedUserDto[];
}
