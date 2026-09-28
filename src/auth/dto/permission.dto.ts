import { IsNotEmpty, IsString, IsBoolean } from 'class-validator';

export class PermissionDto {
  @IsString()
  @IsNotEmpty({ message: 'Permission name is required' })
  permission: string;

  @IsBoolean({ message: 'enable must be a boolean (true/false)' })
  @IsNotEmpty({ message: 'enable is required' })
  enable: boolean;
}
