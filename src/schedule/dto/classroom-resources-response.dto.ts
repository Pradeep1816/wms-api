import { IsNumber, IsString } from 'class-validator';

export class ClassroomResourceDto {
  @IsNumber()
  id: number;

  @IsString()
  title: string;

  @IsString()
  description: string;
}

export class ClassroomResourcesResponseDto {
  resources: ClassroomResourceDto[];
}
