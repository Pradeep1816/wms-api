import { IsString, IsNumber, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsNumber()
  rate: number;

  @IsOptional()
  @IsNumber()
  type?: number;

  @IsOptional()
  @IsNumber()
  status?: number;
}

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  type?: number;

  @IsOptional()
  @IsNumber()
  status?: number;
}

export class ProgramResponseDto {
  id: number;
  name: string;
  rate: number;
  status: number;
  type: number;
  isDeleted: boolean;
  createdOn: Date;
  updatedOn: Date;
  createdByUserId: number;
  updatedByUserId: number;
}

export class ProgramListDto {
  id: number;
  name: string;
  rate: number | null;
}
