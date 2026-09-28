import { IsNotEmpty, IsString } from 'class-validator';

export class GetItemByCodeDto {
  @IsNotEmpty()
  @IsString()
  code: string;
}
