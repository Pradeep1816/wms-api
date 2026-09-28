import { Expose, Type } from 'class-transformer';

export class PermissionItemDto {

  @Expose()
  description: string;

  @Expose()
  staffmember: boolean;

  @Expose()
  permission: string;
}

export class PermissionDataDto {
  @Expose()
  @Type(() => PermissionItemDto)
  permissions: PermissionItemDto[];
}
