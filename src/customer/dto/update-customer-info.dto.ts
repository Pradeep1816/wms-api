import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class UpdateCustomerInfoDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  data: any;
}
