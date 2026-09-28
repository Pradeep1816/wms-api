import { IsOptional, IsString } from 'class-validator';

export class UpdateReleaseNoteRequestDto {

  @IsString()
  @IsOptional()
  scheduleDate: string; 

  @IsOptional()
  @IsString()
  version:string;

  @IsString()
  @IsOptional()
  subject: string;

  @IsString()
  @IsOptional()
  summary: string;

  @IsString()
  @IsOptional()
  notes: string;
}
