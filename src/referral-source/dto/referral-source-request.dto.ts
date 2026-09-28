import { IsIn, IsOptional, IsString } from "class-validator";

export class ReferralSourceRequestDto {
  @IsOptional()
  @IsString()
  sort: string = 'name';   

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'ASC'; 
}
