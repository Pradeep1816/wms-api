import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClassroomRequestDto {

  @IsString()
  @IsNotEmpty({ message: 'Shortname is required' })
  name: string;

  @IsString()
  @IsNotEmpty({message:'description is required'})
  description?: string;
}
