import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class DeleteCustomerInfoDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['email', 'phone', 'addresses'])
  type: 'email' | 'phone' | 'addresses';

  @IsString()
  @IsNotEmpty()
  id: string; // ID of the contact item to delete
}
