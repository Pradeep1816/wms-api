import { IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class DeleteUserInfoDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['email', 'phone', 'addresses'])
  type: 'email' | 'phone' | 'addresses';

  @Type(() => Number)
  @IsNumber()
  id: number;
}

